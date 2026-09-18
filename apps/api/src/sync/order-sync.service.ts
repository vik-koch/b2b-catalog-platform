import { HttpException, Injectable } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import {
  ORDER_SYNC_ROW_ERROR_CODES,
  OrderSyncPlan,
  OrderSyncRowError,
  OrderSyncRowErrorCode,
  OrderSyncSubmission,
  OrderSyncSubmitResponse,
  OrderWriteResult,
  SYNC_PREVIEW_MAX_ITEMS,
  SyncFailureReport,
  SyncRun,
  SyncSummary,
} from '@b2b-catalog-platform/shared';
import { DRIZZLE } from '../db/database.module';
import * as schema from '../db/schema';
import { syncRuns } from '../db/schema';
import { OrdersService } from '../orders/orders.service';
import { SettingsService } from '../settings/settings.service';
import { ordersNotExternallyOwned } from '../settings/ownership.refusals';
import { Submitter } from './sync-run';
import { SyncRunLog, toSyncRun } from './sync-run-log';
import { SyncNotifications } from './sync-notifications';

/**
 * The order write-back (FR-ADM-08, ADR 0062): what an owning system says has
 * become of the orders it was handed.
 *
 * **A batch is one run, applied as it arrives.** The other two areas stage a
 * run when its effect is larger than the deployment lets one apply unattended,
 * because a person is the fallback owner of a catalog and of a customer book.
 * Here the premise of the arrangement is that the platform is *not* the
 * reviewer: staging an answer to an order would leave the customer waiting on
 * a decision nobody in this shop is placed to take, and a source polling every
 * few minutes would file a run per cycle for somebody to read.
 *
 * **One instruction failing never fails the batch.** Each order is written on
 * its own and refused on its own, so a run that could not answer three orders
 * still answered the other forty — an all-or-nothing batch would have the
 * source re-send the lot to retry three, and re-answer the forty on the way.
 */
@Injectable()
export class OrderSyncService {
  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof schema>,
    private readonly settings: SettingsService,
    private readonly orders: OrdersService,
    private readonly log: SyncRunLog,
    private readonly notifications: SyncNotifications,
  ) {}

  private get ordersAreOwned(): boolean {
    return this.settings.isExternallyOwned('orders');
  }

  /**
   * One batch: every instruction in it, then the run that records what became
   * of them.
   *
   * The run is written *after* the work rather than before it, which is the
   * opposite of the staging areas and follows from the same fact: there is no
   * moment here at which a run exists and has not happened yet.
   */
  async submit(
    submission: OrderSyncSubmission,
    submitter: Submitter,
  ): Promise<OrderSyncSubmitResponse> {
    // Nobody has handed order processing over, so the shop is answering its
    // own orders — the mirror of the refusal the admin panel meets while the
    // area *is* owned.
    if (!this.ordersAreOwned) throw ordersNotExternallyOwned();

    // Whoever acted over there, or the credential that spoke for them. Either
    // way an opaque label: it is written beside the versions this run produces
    // and never resolved to an account here (FR-ADM-08).
    const source = submission.actor ?? submitter.name;
    const results: OrderWriteResult[] = [];
    const rowErrors: OrderSyncRowError[] = [];
    const seen = new Set<string>();

    for (const [index, instruction] of submission.orders.entries()) {
      const row = index + 1;
      // Two answers to one question, with nothing here able to say which of
      // them the source meant to be the later one.
      if (seen.has(instruction.reference)) {
        rowErrors.push({
          row,
          reference: instruction.reference,
          code: 'duplicate-reference',
        });
        continue;
      }
      seen.add(instruction.reference);

      try {
        results.push(await this.orders.writeBack(instruction, source));
      } catch (error) {
        const refusal = rowError(row, instruction.reference, error);
        // Anything without one of this area's codes is a fault rather than a
        // refusal, and a fault must not be filed as a row somebody typed
        // badly.
        if (!refusal) throw error;
        rowErrors.push(refusal);
      }
    }

    const plan = toPlan(submission.orders.length, results, rowErrors);
    // Nothing happened at all: no order written, none refused. The ordinary
    // answer to a source that re-sends what it already sent, and filed as the
    // status that says so rather than as a run that did something.
    const nothingToDo = plan.summary.update === 0 && plan.summary.errors === 0;

    await this.log.prune();
    // Where this area's feed stood before this run, read before the row that
    // becomes its new answer.
    const previous = await this.log.previousMachineStatus('orders');
    const now = new Date();
    const [written] = await this.db
      .insert(syncRuns)
      .values({
        area: 'orders',
        status: nothingToDo ? 'no-change' : 'applied',
        startedAt: now,
        finishedAt: now,
        source: 'api',
        filename: submission.label ?? null,
        tokenId: submitter.id,
        tokenName: submitter.name,
        // Never staged, so there is no reason to give and nothing to hold:
        // `rows` and `options` are what a staged run keeps for its second look.
        stagedReason: null,
        options: null,
        rows: null,
        summary: plan.summary,
        plan,
        notice: submission.notice ?? null,
      })
      .returning();

    const run = toSyncRun(written);
    await this.notifications.announce(run, previous);
    return { run, plan };
  }

  /**
   * A breakage the caller could not turn into a run, recorded as a failed run
   * of its own — because the alternative is silence, and an exchange that has
   * stopped answering orders looks exactly like one with nothing to answer.
   */
  async reportFailure(
    report: SyncFailureReport,
    submitter: Submitter,
  ): Promise<{ run: SyncRun }> {
    if (!this.ordersAreOwned) throw ordersNotExternallyOwned();
    const previous = await this.log.previousMachineStatus('orders');
    const now = new Date();
    const [row] = await this.db
      .insert(syncRuns)
      .values({
        area: 'orders',
        status: 'failed',
        source: 'api',
        filename: report.label ?? null,
        tokenId: submitter.id,
        tokenName: submitter.name,
        startedAt: now,
        finishedAt: now,
        error: report.message,
      })
      .returning();
    const run = toSyncRun(row);
    await this.notifications.announce(run, previous);
    return { run };
  }
}

/** The counts every run is summarised by, in this area's terms. */
function toPlan(
  rows: number,
  results: OrderWriteResult[],
  rowErrors: OrderSyncRowError[],
): OrderSyncPlan {
  const written = results.filter((result) => result.kind !== 'unchanged');
  const summary: SyncSummary = {
    rows,
    // Nothing is created here and nothing is removed: an order arrives from
    // the storefront and stays. `update` is the orders this run answered.
    create: 0,
    update: written.length,
    softDelete: 0,
    restore: 0,
    unchanged: results.length - written.length,
    categoriesCreated: 0,
    categoriesRenamed: 0,
    categoriesEmptied: 0,
    keptManual: 0,
    mailed: results.filter((result) => result.notified).length,
    claimed: 0,
    claimedById: 0,
    errors: rowErrors.length,
    // What this run did, rather than how much: the same line the catalog's
    // `price:<key>` fills, worded for what an order can have done to it.
    fields: [
      written.some((result) => result.kind === 'transition') ? 'status' : '',
      written.some((result) => result.kind === 'adjustment') ? 'lines' : '',
      written.some((result) => result.kind === 'payment') ? 'payment' : '',
    ].filter((field) => field !== ''),
  };
  return {
    summary,
    // Capped so a batch of ten thousand orders answers with a response rather
    // than a download; the counts above stay exact.
    orders: results.slice(0, SYNC_PREVIEW_MAX_ITEMS),
    rowErrors: rowErrors.slice(0, SYNC_PREVIEW_MAX_ITEMS),
    truncated:
      results.length > SYNC_PREVIEW_MAX_ITEMS ||
      rowErrors.length > SYNC_PREVIEW_MAX_ITEMS,
  };
}

const ROW_ERROR_CODES: readonly string[] = ORDER_SYNC_ROW_ERROR_CODES;

/**
 * One order's refusal, as a row of the run.
 *
 * The write raises the refusals every other caller of it raises — an order
 * that moved on, a move the table does not allow, a product nothing answers
 * to — and this is where they stop being an answer to *the request* and become
 * a line in *the run*. Anything carrying a code this area does not name is
 * handed back to the caller as the fault it is.
 */
function rowError(
  row: number,
  reference: string,
  error: unknown,
): OrderSyncRowError | null {
  if (!(error instanceof HttpException)) return null;
  const body = error.getResponse();
  if (typeof body !== 'object' || body === null || !('code' in body)) {
    return null;
  }
  const { code, current, productSourceId } = body as {
    code: unknown;
    current?: unknown;
    productSourceId?: unknown;
  };
  if (typeof code !== 'string' || !ROW_ERROR_CODES.includes(code)) return null;

  // The values from the sending system's own data that the deployment's
  // wording quotes back — which version the order actually stands at, which
  // product key nothing answers to.
  const params: Record<string, string> = { reference };
  if (typeof current === 'number') params.current = String(current);
  if (typeof productSourceId === 'string') {
    params.productSourceId = productSourceId;
  }
  return {
    row,
    reference,
    code: code as OrderSyncRowErrorCode,
    params,
  };
}
