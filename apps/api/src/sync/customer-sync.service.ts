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
  SyncCommitResponse,
  SyncFailureReport,
  SyncRun,
  customerSyncOptionsSchema,
  decideCustomerAutoApply,
} from '@b2b-catalog-platform/shared';
import { DRIZZLE } from '../db/database.module';
import * as schema from '../db/schema';
import { customerTiers, passwordTokens, syncRuns, users } from '../db/schema';
import { CUSTOMER_SYNC_POLICY } from '../config/deployment-config';
import { SettingsService } from '../settings/settings.service';
import {
  customersExternallyOwned,
  customersNotExternallyOwned,
} from '../settings/ownership.refusals';
import { PasswordService } from '../auth/password.service';
import { AccountInvitations } from '../users/account-invitations';
import { StaffUsersService } from '../users/staff-users.service';
import {
  CustomerSyncActions,
  CustomerSyncState,
  planCustomerSync,
} from './customer-sync';
import { Actor, CONFLICT_CODE, Submitter, runNotFound } from './sync-run';
import { SyncRunLog, toSyncRun } from './sync-run-log';
import { StagedPayloadOf, stagedPayload } from './sync-run-payload';

/** The transaction handle Drizzle hands a `db.transaction` callback. */
type Tx = Parameters<
  Parameters<NodePgDatabase<typeof schema>['transaction']>[0]
>[0];

type Reader = Pick<NodePgDatabase<typeof schema>, 'select'>;

/**
 * Whether a run has anything in it at all.
 *
 * A mail counts. A run that changed no account but sent somebody the link they
 * rang the shop about did something, and filing it as "nothing happened" would
 * put a mail a person received under a status that says none was sent. Skipped
 * rows count for the catalog's reason: a run that could not read what it was
 * given is the opposite of a quiet night.
 */
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
 * The customer exchange (FR-ADM-11): what an automated client may do to the
 * accounts of the people who buy from the shop.
 *
 * The same two halves the catalog engine has, for the same reason — stage a
 * run, then either apply it or leave it for a person — and the same differ
 * discipline: a commit re-diffs the staged rows against state read inside its
 * own transaction, so a half-written customer list is not a state this can
 * reach.
 *
 * **It tells the shop nothing by mail yet.** A customer run reaches its
 * readers through the panel — the run log and the work-awaiting count, both
 * already split per area — and not through the four sync mails beside it:
 * every one of those is worded about the catalog ("Catalog update failed"),
 * and sending a manager one of those about a customer run would be worse than
 * sending nothing. The per-area wording is FR-NOTIF-09, which arrives with the
 * notifications slice; the channel that does not depend on mail is the one
 * ADR 0057 already leans on.
 *
 * What it will not do is the part worth stating here. It **issues no
 * credential** (FR-ADM-13): an account it asks for is created `invited` with
 * an unusable password hash, and the person is mailed the platform's own
 * set-a-password link. And it **never deletes** (FR-ADM-15): the strongest row
 * it obeys switches an account off, which keeps everything that says who
 * somebody was.
 */
@Injectable()
export class CustomerSyncService {
  private readonly logger = new Logger('CustomerSync');

  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof schema>,
    @Inject(CUSTOMER_SYNC_POLICY) private readonly policy: CustomerSyncPolicy,
    private readonly settings: SettingsService,
    private readonly log: SyncRunLog,
    private readonly invitations: AccountInvitations,
    private readonly staffUsers: StaffUsersService,
    private readonly passwords: PasswordService,
  ) {}

  /** Whether the exchange currently holds the pen (FR-ADM-10). */
  private get customersAreOwned(): boolean {
    return this.settings.isExternallyOwned('customers');
  }

  /**
   * The headless run: stage it, then let the policy decide whether it applies
   * itself.
   *
   * Staged first and unconditionally, so a run exists in the log before
   * anything is written and whatever happens next has a row to happen to.
   */
  async submit(
    submission: CustomerSyncSubmission,
    submitter: Submitter,
  ): Promise<CustomerSyncSubmitResponse> {
    // Nobody has handed customer accounts over, so the shop is working them by
    // hand and a second writer is refused — the mirror of the refusal the
    // admin panel meets while they *are* owned.
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

    if (nothingToDo || stagedReason) return { run: toSyncRun(row), plan };

    const applied = await this.applyRun(row.id, null);
    return { run: applied.run, plan: applied.plan };
  }

  /**
   * The operator's own run: rows read out of an uploaded file, staged for a
   * person to read before anything is written (FR-ADM-12).
   *
   * Parse-free, exactly as the catalog's is — the rows arrive validated, from
   * a file or from a submission, and this is the one engine both of them reach.
   * What it does *not* share with `submit` is the policy: an upload is never
   * applied by itself, whatever the diff says. There is a person at the other
   * end of it by definition, and the preview is the thing they asked for.
   *
   * It exists for the case the automated exchange does not cover — a go-live
   * with several hundred customers whose tiers are already settled in the other
   * system — so it is refused exactly while somebody else holds the pen
   * (FR-ADM-10), the mirror of the refusal `submit` meets when nobody does.
   */
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

    // Nothing to decide: the run is recorded as it stands and stages no rows,
    // rather than waiting in a queue for somebody to press a button that is
    // not even on the screen.
    const nothingToDo = isNoChange(plan);

    await this.log.prune();
    // A staged upload retires a staged upload, for the reason a machine run
    // retires one: two previews of the same accounts are two answers to one
    // question, and the older one is answering it against a catalog of
    // accounts that has moved.
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

  /**
   * A breakage the caller could not turn into a run, recorded as a failed run
   * of its own — because the alternative is silence, and an exchange that has
   * stopped working looks exactly like one with nothing to send.
   */
  async reportFailure(
    report: SyncFailureReport,
    submitter: Submitter,
  ): Promise<{ run: SyncRun }> {
    if (!this.customersAreOwned) throw customersNotExternallyOwned();
    const now = new Date();
    const [row] = await this.db
      .insert(syncRuns)
      .values({
        area: 'customers',
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
    return { run: toSyncRun(row) };
  }

  /** A staged run, applied by a person (a manager or an admin). */
  async commit(id: string, actor: Actor): Promise<SyncCommitResponse> {
    const { run, applied } = await this.applyRun(id, actor);
    return { run, applied };
  }

  /**
   * Recompute a staged run's diff against the accounts as they stand now. What
   * a staged run's page shows: the preview is advisory, and a person about to
   * apply one has to be looking at what would happen now.
   */
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

  /**
   * The commit itself, with or without a person behind it.
   *
   * One transaction from claiming the run to marking it applied, so the
   * accounts and the run's own record cannot disagree. The mails go **after**
   * it commits: a set-a-password link that has gone out cannot be rolled back,
   * so it must not be sent for a write that might still fail.
   */
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
        // Restates the area check above for the compiler's benefit: the staged
        // columns are typed as the union of every area's shape, and this is
        // what narrows them to this one.
        if (staged.area !== 'customers') throw runNotFound();
        // Applying is the write, so it is judged by the setting in force now
        // rather than the one in force when the file went up: a run uploaded
        // before the area was handed over is not a way to get a manual write in
        // afterwards. Nothing can reach this yet — the manual import is the
        // next slice — but the rule belongs beside the write, not beside the
        // entry point that will need it.
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
            // The staged input has served its purpose; what replaces it is the
            // diff, because "which accounts moved last night" is the question
            // this log exists to answer.
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
      // A refusal is not a failed run: the run is untouched and still
      // previewed, and saying otherwise would retire a run nobody applied.
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

  /**
   * Applies a plan, in the caller's transaction. Returns the ids of the
   * accounts it created, which is what the mailing step needs and what did not
   * exist when the plan was computed.
   */
  private async apply(tx: Tx, actions: CustomerSyncActions): Promise<string[]> {
    const invitedIds: string[] = [];

    // Adoptions first (FR-ADM-17): from here on this account *is* what the key
    // means, and everything below it in this run writes to it under that
    // identity rather than by address.
    //
    // Guarded on the key still being null, so a claim can only ever fill an
    // empty column — never move a key from one account to another, which is
    // the one thing FR-ADM-14 exists to prevent. If another run got there
    // first the write is simply skipped: the account is the same person's
    // either way, and the rest of this row still applies to it.
    for (const claim of actions.claimAccounts) {
      await tx
        .update(users)
        .set({ sourceId: claim.sourceId, updatedAt: new Date() })
        .where(and(eq(users.id, claim.id), isNull(users.sourceId)));
    }

    for (const account of actions.createAccounts) {
      // The stand-in hash, made the way a staff-created account's is: a real
      // argon2 hash of a value nobody holds, so there is never a state where a
      // password exists that two parties know (FR-ADM-13). `passwordSetAt`
      // stays null, which is what tells this account apart from one whose
      // owner has chosen a password.
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
          // Approved by the exchange, which is not a person: the column that
          // names one stays null rather than borrowing an admin who was not
          // there. The run itself records the credential that did it.
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
          // Ends every session already in flight, not just the next sign-in —
          // the half of a deactivation that matters on the day it is used.
          ...(move.endSessions
            ? { tokenVersion: sql`${users.tokenVersion} + 1` }
            : {}),
          updatedAt: new Date(),
        })
        .where(eq(users.id, move.id));
    }

    // A switched-off account's outstanding set-a-password link is the other
    // way in, and would otherwise stay a working key to an account nobody may
    // sign into. Retired in the same transaction as the status.
    const disabledIds = actions.setStatus
      .filter((move) => move.endSessions)
      .map((move) => move.id);
    if (disabledIds.length > 0) {
      // Expiring rather than deleting, exactly as `revokeOutstanding` does:
      // a link that was issued stays in the record, it simply stops working.
      // Written here rather than through that service so it shares this
      // transaction — a status that committed without its links retired would
      // leave a working key behind.
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

  /**
   * The mails, once the write has committed.
   *
   * Never allowed to fail the run that caused it, exactly as an approval's
   * invitation is not: the accounts are written and the log says so whether or
   * not SMTP was reachable. A link that did not arrive is re-sent — by the next
   * run, by the sign-in page's own "forgotten your password", or by a manager
   * once the area is handed back.
   */
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
        // The account moved between the diff and the mail — it can no longer
        // sign in, so there is nothing to send it. Logged rather than raised:
        // the accounts this run wrote are written.
        this.logger.warn(
          `Could not send a password link to ${id}: ${(error as Error).message}`,
        );
      }
    }
  }

  /**
   * The accounts and the price lists, in two queries.
   *
   * Every account, staff included, and not only the ones carrying a source
   * key: the differ has to refuse a row that names a staff account and to
   * notice an address somebody else already holds, and neither question can be
   * answered by the customers alone. A shop's account book is a few hundred
   * rows — the same reasoning that reads the whole catalog into memory.
   */
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
    };
  }
}
