import {
  ConflictException,
  HttpException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import {
  CustomerSyncOptions,
  CustomerSyncPlan,
  CustomerSyncPolicy,
  CustomerSyncPreviewResponse,
  CustomerSyncRow,
  CustomerSyncRowError,
  CustomerSyncSubmission,
  CustomerSyncSubmitResponse,
  SyncFailureReport,
  SyncRun,
  customerSyncOptionsSchema,
  decideCustomerAutoApply,
  SyncCommitResponse,
} from '@b2b-catalog-platform/shared/core/exchange';
import { DRIZZLE } from '../../db/database.module';
import * as schema from '../../db/schema';
import {
  customerTiers,
  passwordTokens,
  syncRuns,
  users,
} from '../../db/schema';
import {
  ACCEPTED_CUSTOMER_TYPES,
  CUSTOMER_SYNC_POLICY,
} from '../../config/deployment-config';
import { OwnershipState } from '../../platform/settings/ownership-state';
import {
  customersExternallyOwned,
  customersNotExternallyOwned,
} from '../../platform/settings/ownership.refusals';
import { PasswordService } from '../accounts/password.service';
import { AccountInvitations } from '../accounts/account-invitations';
import { StaffUsersService } from '../accounts/staff-users.service';
import {
  CustomerSyncActions,
  CustomerSyncState,
  planCustomerSync,
} from './customer-sync';
import {
  Actor,
  CONFLICT_CODE,
  Reader,
  Submitter,
  Tx,
  runNotFound,
} from './sync-run';
import { SyncRunLog, toSyncRun } from './sync-run-log';
import { SyncNotifications } from './sync-notifications';
import { StagedPayloadOf, stagedPayload } from './sync-run-payload';
import { CustomerType } from '@b2b-catalog-platform/shared/core/accounts';

/** A sent mail counts, as do skipped rows: an unreadable file is not a
 * quiet night. */
function isNoChange(plan: CustomerSyncPlan): boolean {
  const s = plan.summary;
  return (
    s.create +
      s.update +
      s.softDelete +
      s.restore +
      s.claimed +
      s.mailed +
      s.errors ===
    0
  );
}

/**
 * The customer exchange (FR-ADM-11, FR-ADM-12), staged and applied like the
 * catalog's. It issues no credential (FR-ADM-13): a new account is `invited`
 * and mailed the platform's set-a-password link. It never deletes
 * (FR-ADM-15): the strongest row switches an account off.
 */
@Injectable()
export class CustomerSyncService {
  private readonly logger = new Logger('CustomerSync');

  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof schema>,
    @Inject(CUSTOMER_SYNC_POLICY) private readonly policy: CustomerSyncPolicy,
    @Inject(ACCEPTED_CUSTOMER_TYPES)
    private readonly customerTypes: readonly CustomerType[],
    private readonly ownership: OwnershipState,
    private readonly log: SyncRunLog,
    private readonly invitations: AccountInvitations,
    private readonly staffUsers: StaffUsersService,
    private readonly passwords: PasswordService,
    private readonly notifications: SyncNotifications,
  ) {}

  private get customersAreOwned(): boolean {
    return this.ownership.isExternallyOwned('customers');
  }

  /** The headless run: always staged first, then the policy decides. */
  async submit(
    submission: CustomerSyncSubmission,
    submitter: Submitter,
  ): Promise<CustomerSyncSubmitResponse> {
    if (!this.customersAreOwned) throw customersNotExternallyOwned();

    const options = customerSyncOptionsSchema.parse(submission.options ?? {});
    const state = await this.readState();
    const { plan } = planCustomerSync(submission.rows, options, state);

    const nothingToDo = isNoChange(plan);
    const stagedReason = nothingToDo
      ? null
      : decideCustomerAutoApply(
          plan.summary,
          this.policy,
          submission.requestReview,
        );

    await this.log.prune();
    const previous = await this.log.previousMachineStatus('customers');
    await this.log.supersedeStaged('customers');
    const [row] = await this.db
      .insert(syncRuns)
      .values({
        area: 'customers',
        status: nothingToDo ? 'no-change' : 'previewed',
        finishedAt: nothingToDo ? new Date() : null,
        source: 'api',
        filename: submission.label ?? null,
        tokenId: submitter.id,
        tokenName: submitter.name,
        stagedReason,
        options,
        summary: plan.summary,
        rows: nothingToDo ? null : submission.rows,
        plan: nothingToDo ? plan : null,
        notice: submission.notice ?? null,
      })
      .returning();

    if (nothingToDo || stagedReason) {
      const run = toSyncRun(row);
      await this.notifications.announce(run, previous);
      return { run, plan };
    }

    const applied = await this.applyRun(row.id, null);
    await this.notifications.announce(applied.run, previous);
    return { run: applied.run, plan: applied.plan };
  }

  /** An uploaded file's rows, staged for a person (FR-ADM-12); never
   * applied by itself, and closed while the area is owned (FR-ADM-10). */
  async preview(
    rows: CustomerSyncRow[],
    options: CustomerSyncOptions,
    filename: string | null,
    actor: Actor,
    parseErrors: CustomerSyncRowError[] = [],
  ): Promise<CustomerSyncPreviewResponse> {
    if (this.customersAreOwned) throw customersExternallyOwned('upload');

    const state = await this.readState();
    const { plan } = planCustomerSync(rows, options, state, parseErrors);

    // Nothing to decide: recorded as it stands, staging nothing.
    const nothingToDo = isNoChange(plan);

    await this.log.prune();
    // Retires a machine run still staged from before the area was taken back.
    await this.log.supersedeStaged('customers');
    const [row] = await this.db
      .insert(syncRuns)
      .values({
        area: 'customers',
        status: nothingToDo ? 'no-change' : 'previewed',
        finishedAt: nothingToDo ? new Date() : null,
        source: 'upload',
        filename,
        actorId: actor.id,
        actorEmail: actor.email,
        options,
        summary: plan.summary,
        rows: nothingToDo ? null : rows,
        parseErrors: nothingToDo ? null : parseErrors,
        plan: nothingToDo ? plan : null,
      })
      .returning();

    return { run: toSyncRun(row), plan };
  }

  async reportFailure(
    report: SyncFailureReport,
    submitter: Submitter,
  ): Promise<{ run: SyncRun }> {
    if (!this.customersAreOwned) throw customersNotExternallyOwned();
    const { run, previous } = await this.log.recordFailure(
      'customers',
      report,
      submitter,
    );
    await this.notifications.announce(run, previous);
    return { run };
  }

  /** A staged run, applied by a person (a manager or an admin). */
  async commit(id: string, actor: Actor): Promise<SyncCommitResponse> {
    const { run, applied } = await this.applyRun(id, actor);
    return { run, applied };
  }

  /** A staged run's diff against the accounts now, for its page. */
  async replan(
    staged: StagedPayloadOf<'customers'>,
  ): Promise<CustomerSyncPlan> {
    const state = await this.readState();
    return planCustomerSync(
      staged.rows,
      staged.options,
      state,
      staged.parseErrors,
    ).plan;
  }

  /** One transaction from claiming the run to marking it applied; the mails
   * go after the commit, as a sent link cannot be rolled back. */
  private async applyRun(
    id: string,
    actor: Actor | null,
  ): Promise<SyncCommitResponse & { plan: CustomerSyncPlan }> {
    let outcome: {
      run: SyncRun;
      plan: CustomerSyncPlan;
      invitedIds: string[];
      mailLinkIds: string[];
    };
    try {
      outcome = await this.db.transaction(async (tx) => {
        const [run] = await tx
          .select()
          .from(syncRuns)
          .where(eq(syncRuns.id, id))
          .for('update');
        if (!run) throw runNotFound();
        if (run.area !== 'customers') throw runNotFound();
        if (run.status !== 'previewed') {
          throw new ConflictException({
            code: CONFLICT_CODE[run.status],
            message: `This run is ${run.status} and cannot be applied`,
          });
        }
        const staged = stagedPayload(run);
        if (!staged) {
          throw new ConflictException({
            code: 'run-rows-pruned',
            message: 'This run’s staged rows have been pruned',
          });
        }
        // Narrows the payload; the compiler cannot carry the check above.
        if (staged.area !== 'customers') throw runNotFound();
        // Judged by the setting now, not at upload: an upload staged before
        // the hand-over is no way to write by hand afterwards.
        if (run.source === 'upload' && this.customersAreOwned) {
          throw customersExternallyOwned('apply an uploaded run');
        }

        const state = await this.readState(tx);
        const { plan, actions } = planCustomerSync(
          staged.rows,
          staged.options,
          state,
          staged.parseErrors,
        );
        const invitedIds = await this.apply(tx, actions);

        const [updated] = await tx
          .update(syncRuns)
          .set({
            status: 'applied',
            finishedAt: new Date(),
            summary: plan.summary,
            ...(actor ? { actorId: actor.id, actorEmail: actor.email } : {}),
            // The diff replaces the input: "what moved last night" is what the
            // log is read for.
            rows: null,
            parseErrors: null,
            plan,
          })
          .where(eq(syncRuns.id, id))
          .returning();

        return {
          run: toSyncRun(updated),
          plan,
          invitedIds,
          mailLinkIds: actions.mailLinkIds,
        };
      });
    } catch (error) {
      // A refusal leaves the run previewed; it did not fail.
      if (error instanceof HttpException) throw error;
      const message = error instanceof Error ? error.message : String(error);
      await this.db
        .update(syncRuns)
        .set({ status: 'failed', finishedAt: new Date(), error: message })
        .where(eq(syncRuns.id, id));
      throw error;
    }

    await this.sendLinks(outcome.invitedIds, outcome.mailLinkIds);
    return {
      run: outcome.run,
      applied: outcome.plan.summary,
      plan: outcome.plan,
    };
  }

  /** In the caller's transaction; returns the created accounts' ids for the
   * mails. */
  private async apply(tx: Tx, actions: CustomerSyncActions): Promise<string[]> {
    const invitedIds: string[] = [];

    // Claims first (FR-ADM-17), so the rest of the run writes by key. Only an
    // empty key is filled: a key never moves between accounts (FR-ADM-14).
    for (const claim of actions.claimAccounts) {
      await tx
        .update(users)
        .set({ sourceId: claim.sourceId, updatedAt: new Date() })
        .where(and(eq(users.id, claim.id), isNull(users.sourceId)));
    }

    for (const account of actions.createAccounts) {
      // A hash of a value nobody holds, so no password is ever known to two
      // parties (FR-ADM-13); a null `passwordSetAt` marks it.
      const [created] = await tx
        .insert(users)
        .values({
          email: account.email,
          passwordHash: await this.passwords.unusableHash(),
          role: 'user',
          status: 'invited',
          sourceId: account.sourceId,
          firstName: account.firstName,
          lastName: account.lastName,
          phone: account.phone,
          tierId: account.tierId,
          customerType: account.customerType,
          companyName: account.companyName,
          companyRegistrationId: account.companyRegistrationId,
          // No approver: the exchange is not a person, the run names it.
          approvedAt: new Date(),
        })
        .returning({ id: users.id });
      invitedIds.push(created.id);
    }

    for (const update of actions.updateAccounts) {
      await tx
        .update(users)
        .set({
          ...(update.email !== undefined ? { email: update.email } : {}),
          ...(update.tierId !== undefined ? { tierId: update.tierId } : {}),
          ...(update.customerType !== undefined
            ? { customerType: update.customerType }
            : {}),
          ...(update.companyName !== undefined
            ? { companyName: update.companyName }
            : {}),
          ...(update.companyRegistrationId !== undefined
            ? { companyRegistrationId: update.companyRegistrationId }
            : {}),
          updatedAt: new Date(),
        })
        .where(eq(users.id, update.id));
    }

    if (actions.approveIds.length > 0) {
      await tx
        .update(users)
        .set({ approvedAt: new Date(), updatedAt: new Date() })
        .where(inArray(users.id, actions.approveIds));
    }

    for (const move of actions.setStatus) {
      await tx
        .update(users)
        .set({
          status: move.status,
          // Ends the sessions in flight, not only the next sign-in.
          ...(move.endSessions
            ? { tokenVersion: sql`${users.tokenVersion} + 1` }
            : {}),
          updatedAt: new Date(),
        })
        .where(eq(users.id, move.id));
    }

    // An open set-a-password link is the other way in.
    const disabledIds = actions.setStatus
      .filter((move) => move.endSessions)
      .map((move) => move.id);
    if (disabledIds.length > 0) {
      // Expired like `revokeOutstanding` does, but here so it shares the
      // status's transaction.
      await tx
        .update(passwordTokens)
        .set({ expiresAt: new Date(0) })
        .where(
          and(
            inArray(passwordTokens.userId, disabledIds),
            isNull(passwordTokens.usedAt),
          ),
        );
    }

    return invitedIds;
  }

  /** Never fails the run: a lost link is re-sent by the next run, by
   * "forgotten your password", or by a manager. */
  private async sendLinks(
    invitedIds: string[],
    mailLinkIds: string[],
  ): Promise<void> {
    for (const id of invitedIds) {
      const user = await this.staffUsers.findById(id);
      if (user) await this.invitations.send(user, 'created');
    }
    for (const id of mailLinkIds) {
      const user = await this.staffUsers.findById(id);
      if (!user) continue;
      try {
        await this.invitations.sendPasswordLink(user);
      } catch (error) {
        // The account can no longer sign in since the diff; the run stands.
        this.logger.warn(
          `Could not send a password link to ${id}: ${(error as Error).message}`,
        );
      }
    }
  }

  /** Every account, staff included: the differ must refuse a row naming
   * staff and see an address already taken. */
  private async readState(db: Reader = this.db): Promise<CustomerSyncState> {
    const [accountRows, tierRows] = await Promise.all([
      db
        .select({
          id: users.id,
          sourceId: users.sourceId,
          email: users.email,
          role: users.role,
          status: users.status,
          tierId: users.tierId,
          tierKey: customerTiers.key,
          customerType: users.customerType,
          companyName: users.companyName,
          companyRegistrationId: users.companyRegistrationId,
          passwordSetAt: users.passwordSetAt,
        })
        .from(users)
        .leftJoin(customerTiers, eq(users.tierId, customerTiers.id)),
      db
        .select({ id: customerTiers.id, key: customerTiers.key })
        .from(customerTiers),
    ]);

    return {
      accounts: accountRows.map((row) => ({
        ...row,
        hasPassword: row.passwordSetAt !== null,
      })),
      tiers: tierRows,
      customerTypes: this.customerTypes,
    };
  }
}
