import { HttpException, Inject, Injectable } from '@nestjs/common';
import {
  ORDER_SYNC_ROW_ERROR_CODES,
  OrderSyncPlan,
  OrderSyncRowError,
  OrderSyncRowErrorCode,
  OrderWriteResult,
  SYNC_PREVIEW_MAX_ITEMS,
  SyncFailureReport,
  SyncRun,
  SyncSummary,
} from '@b2b-catalog-platform/shared/core/exchange';
import {
  OrderSyncSubmission,
  OrderSyncSubmitResponse,
} from '@b2b-catalog-platform/shared/machine/exchange';
import { DRIZZLE } from '../../platform/db/database.module';
import { syncRuns } from '../../core/exchange/exchange-schema';
import { OrderWriteBack } from './order-write-back';
import { OwnershipState } from '../../platform/settings/ownership-state';
import { ordersNotExternallyOwned } from '../../core/ordering/order-ownership-refusals';
import { Submitter } from '../../core/exchange/sync-run';
import { SyncRunLog, toSyncRun } from '../../core/exchange/sync-run-log';
import { SyncNotifications } from '../../core/exchange/sync-notifications';
import { Database } from '../../platform/db/database';

/**
 * The order write-back (FR-ADM-08): a batch is one run, applied as it arrives,
 * since nobody in the shop is placed to review an answer to an order. Each
 * order is written and refused on its own, so three refusals do not make the
 * source re-send the other forty.
 */
@Injectable()
export class OrderSyncService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly ownership: OwnershipState,
    private readonly orders: OrderWriteBack,
    private readonly log: SyncRunLog,
    private readonly notifications: SyncNotifications,
  ) {}

  private get ordersAreOwned(): boolean {
    return this.ownership.isExternallyOwned('orders');
  }

  /** The run is written after the work: it never exists before it has
   * happened. */
  async submit(
    submission: OrderSyncSubmission,
    submitter: Submitter,
  ): Promise<OrderSyncSubmitResponse> {
    if (!this.ordersAreOwned) throw ordersNotExternallyOwned();

    // An opaque label beside the versions, never resolved to an account.
    const source = submission.actor ?? submitter.name;
    const results: OrderWriteResult[] = [];
    const rowErrors: OrderSyncRowError[] = [];
    const seen = new Set<string>();

    for (const [index, instruction] of submission.orders.entries()) {
      const row = index + 1;
      // Nothing here can say which of two answers the source meant last.
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
        // Without one of this area's codes it is a fault, not a refusal.
        if (!refusal) throw error;
        rowErrors.push(refusal);
      }
    }

    const plan = toPlan(submission.orders.length, results, rowErrors);
    // The ordinary answer to a source re-sending what it already sent.
    const nothingToDo = plan.summary.update === 0 && plan.summary.errors === 0;

    await this.log.prune();
    // Read before the insert, which would otherwise answer the question.
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
        // Never staged, so nothing is kept for a second look.
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

  async reportFailure(
    report: SyncFailureReport,
    submitter: Submitter,
  ): Promise<{ run: SyncRun }> {
    if (!this.ordersAreOwned) throw ordersNotExternallyOwned();
    const { run, previous } = await this.log.recordFailure(
      'orders',
      report,
      submitter,
    );
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
    // Orders are neither created nor removed here; `update` is those answered.
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
    // What this run did, where the catalog lists the fields it wrote.
    fields: [
      written.some((result) => result.kind === 'transition') ? 'status' : '',
      written.some((result) => result.kind === 'adjustment') ? 'lines' : '',
      written.some((result) => result.kind === 'payment') ? 'payment' : '',
    ].filter((field) => field !== ''),
  };
  return {
    summary,
    // Capped so a huge batch answers with a response; the counts stay exact.
    orders: results.slice(0, SYNC_PREVIEW_MAX_ITEMS),
    rowErrors: rowErrors.slice(0, SYNC_PREVIEW_MAX_ITEMS),
    truncated:
      results.length > SYNC_PREVIEW_MAX_ITEMS ||
      rowErrors.length > SYNC_PREVIEW_MAX_ITEMS,
  };
}

const ROW_ERROR_CODES: readonly string[] = ORDER_SYNC_ROW_ERROR_CODES;

/** One order's refusal as a row of the run, or null for an exception that
 * carries none of this area's codes. */
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

  // The sender's own values the deployment's wording quotes back.
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
