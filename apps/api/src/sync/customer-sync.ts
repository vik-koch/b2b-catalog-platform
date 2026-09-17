import {
  CustomerAccountChange,
  CustomerSyncOptions,
  CustomerSyncPlan,
  CustomerSyncRow,
  CustomerSyncRowError,
  CustomerSyncRowErrorCode,
  CustomerType,
  SYNC_PREVIEW_MAX_ITEMS,
  SyncSummary,
  UserRole,
  UserStatus,
} from '@b2b-catalog-platform/shared';

/**
 * The customer differ: rows + intent + the accounts as they stand → what would
 * change (FR-ADM-11).
 *
 * Pure, for the reason the catalog's is: the rules worth arguing about — what
 * an exchange may do to somebody's access, which row is refused, what a
 * repeated instruction comes to — are then testable without a database, and
 * preview and commit can run the identical computation rather than the commit
 * trusting a diff taken earlier.
 *
 * It decides **statuses**, not transitions. Every row says one of two things
 * about access, and what that means for an account is read off the account's
 * own state here — approving a registration, reactivating somebody who was
 * switched off, or nothing at all. The applier writes what this decided and
 * argues with nothing.
 */

/** The slice of the accounts the differ needs. */
export interface CustomerSyncState {
  accounts: ExistingAccount[];
  /** The deployment's price lists, by the key a row names one with. */
  tiers: ExistingCustomerTier[];
}

export interface ExistingCustomerTier {
  id: string;
  key: string;
}

/**
 * One account as it stands. Staff accounts are in here too, and deliberately:
 * they are never customers (FR-ADM-10), but a row that names one has to be
 * refused rather than silently matched against nothing — and their addresses
 * are taken, which a row asking for that address needs to know.
 */
export interface ExistingAccount {
  id: string;
  /** Null for everyone who registered here and was never claimed by a run. */
  sourceId: string | null;
  email: string;
  role: UserRole;
  status: UserStatus;
  tierId: string | null;
  /** The key of `tierId`, or null for the base price list. */
  tierKey: string | null;
  customerType: CustomerType | null;
  companyName: string | null;
  companyRegistrationId: string | null;
  /** Whether this account has a password its owner chose — what decides where
   * a reactivated one lands, exactly as it does for a manager's click. */
  hasPassword: boolean;
}

/** An account this run would create, with what it is created from. */
export interface CreateAccountAction {
  sourceId: string;
  email: string;
  /** Seeded here and never written again (FR-ADM-15). */
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  tierId: string | null;
  customerType: CustomerType | null;
  companyName: string | null;
  companyRegistrationId: string | null;
}

export interface UpdateAccountAction {
  id: string;
  email?: string;
  tierId?: string | null;
  customerType?: CustomerType | null;
  companyName?: string | null;
  companyRegistrationId?: string | null;
}

/**
 * What the applier executes. Separate from the presentational plan for the
 * catalog's reason: the screen's shape and the write path move independently.
 */
export interface CustomerSyncActions {
  createAccounts: CreateAccountAction[];
  updateAccounts: UpdateAccountAction[];
  /**
   * The status each account this run moves should end up in, decided here.
   * `endSessions` marks the move as one that takes access away: the applier
   * bumps the token version and retires any outstanding set-a-password link,
   * which is what stops a switched-off account being usable by a cookie or a
   * mail somebody still has.
   */
  setStatus: { id: string; status: UserStatus; endSessions: boolean }[];
  /** Accounts that end up approved for the first time — the exchange's
   * counterpart of a manager's approval, stamped the same way. */
  approveIds: string[];
  /** Existing accounts to mail a set-a-password link, because their row asked
   * for one. Accounts this run creates are mailed by virtue of being created
   * and are not listed here — they have no id yet. */
  mailLinkIds: string[];
}

interface PlanResult {
  plan: CustomerSyncPlan;
  actions: CustomerSyncActions;
}

/** The statuses that can still sign in, and so can be sent a link. */
const CAN_SIGN_IN: readonly UserStatus[] = ['invited', 'active'];

export function planCustomerSync(
  rows: CustomerSyncRow[],
  options: CustomerSyncOptions,
  state: CustomerSyncState,
): PlanResult {
  const writes = new Set(options.fields);
  const bySourceId = new Map(
    state.accounts
      .filter((account) => account.sourceId)
      .map((account) => [account.sourceId as string, account]),
  );
  const byEmail = new Map(
    state.accounts.map((account) => [account.email.toLowerCase(), account]),
  );
  const tierByKey = new Map(state.tiers.map((tier) => [tier.key, tier.id]));

  const actions: CustomerSyncActions = {
    createAccounts: [],
    updateAccounts: [],
    setStatus: [],
    approveIds: [],
    mailLinkIds: [],
  };
  const changes: CustomerAccountChange[] = [];
  const rowErrors: CustomerSyncRowError[] = [];
  const fieldsWritten = new Set<string>();
  let unchanged = 0;
  let mailed = 0;

  const seenSourceIds = new Set<string>();
  const claimedEmails = new Set<string>();

  rows.forEach((row, index) => {
    const line = index + 1;
    const fail = (
      code: CustomerSyncRowErrorCode,
      params?: Record<string, string>,
    ) => {
      rowErrors.push({
        row: line,
        sourceId: row.sourceId || null,
        code,
        ...(params ? { params } : {}),
      });
    };

    if (!row.sourceId) return fail('missing-source-id');
    if (seenSourceIds.has(row.sourceId)) {
      return fail('duplicate-source-id');
    }
    seenSourceIds.add(row.sourceId);

    const existing = bySourceId.get(row.sourceId);

    // A staff account is not a customer under any setting, so a run that has
    // somehow acquired one's key is refused rather than obeyed: the alternative
    // is an exchange that can tier, disable or re-mail an admin.
    if (existing && existing.role !== 'user') return fail('staff-account');

    // The account was closed by the person themselves (FR-AUTH-06). It kept its
    // key so that this refusal can happen — without it the next run would meet
    // a customer with no account and cheerfully mail them a new one.
    if (existing && existing.status === 'anonymized') {
      return fail('account-withdrawn');
    }

    // Which address this row is about, and whether anybody else has it. An
    // address is checked against every account, staff included: two accounts
    // cannot share one, whatever the roles involved.
    const email = writes.has('email') || !existing ? row.email : undefined;
    if (email) {
      const holder = byEmail.get(email);
      if (holder && holder.id !== existing?.id) {
        return fail(holder.role === 'user' ? 'email-taken' : 'staff-account', {
          email,
        });
      }
      if (claimedEmails.has(email) && email !== existing?.email) {
        return fail('duplicate-email', { email });
      }
      claimedEmails.add(email);
    }

    // The tier, resolved against the lists this deployment actually has. Null
    // is the base list and always resolvable; a key nobody has is a row error
    // rather than a silent fall back to the base price.
    let tierId: string | null | undefined;
    if (writes.has('tier') && row.tierKey !== undefined) {
      if (row.tierKey === null) {
        tierId = null;
      } else {
        tierId = tierByKey.get(row.tierKey);
        if (tierId === undefined) {
          return fail('unknown-tier', {
            key: row.tierKey,
            known: state.tiers.map((tier) => tier.key).join(', '),
          });
        }
      }
    }

    const company = writes.has('company')
      ? resolveCompany(row, existing)
      : null;
    if (company === 'incomplete') return fail('company-details-incomplete');

    if (!existing) {
      // An unknown key that asks for nothing is not a customer this shop has
      // been told to have: the exchange creates an account when it says the
      // person may sign in, and otherwise leaves the shop with one fewer
      // account than the other system has records.
      if (row.access !== 'enabled') {
        if (row.sendPasswordLink) fail('cannot-send-link');
        return;
      }
      if (!options.createMissing) return fail('cannot-create-account');
      if (!row.email) return fail('cannot-create-account');

      actions.createAccounts.push({
        sourceId: row.sourceId,
        email: row.email,
        firstName: row.firstName ?? null,
        lastName: row.lastName ?? null,
        phone: row.phone ?? null,
        tierId: tierId ?? null,
        customerType: company ? company.customerType : null,
        companyName: company ? company.companyName : null,
        companyRegistrationId: company ? company.companyRegistrationId : null,
      });
      changes.push({
        kind: 'invite',
        sourceId: row.sourceId,
        email: row.email,
        id: null,
        changes: [],
        mailed: true,
      });
      mailed++;
      return;
    }

    if (!options.updateExisting) {
      unchanged++;
      return;
    }

    // What this row would rewrite, and what it is worth saying about it. A
    // field whose value already matches produces nothing at all: a feed sends
    // its whole record every run, and a log in which every run says it wrote
    // everything answers no question anybody has (FR-ADM-16).
    const fieldChanges: CustomerAccountChange['changes'] = [];
    const update: UpdateAccountAction = { id: existing.id };

    if (email !== undefined && email !== existing.email) {
      update.email = email;
      fieldChanges.push({ field: 'email', from: existing.email, to: email });
    }
    if (tierId !== undefined && tierId !== existing.tierId) {
      update.tierId = tierId;
      fieldChanges.push({
        field: 'tier',
        from: existing.tierKey,
        to: tierId === null ? null : keyOf(state.tiers, tierId),
      });
    }
    if (company) {
      if (company.customerType !== existing.customerType) {
        update.customerType = company.customerType;
        fieldChanges.push({
          field: 'customerType',
          from: existing.customerType,
          to: company.customerType,
        });
      }
      if (company.companyName !== existing.companyName) {
        update.companyName = company.companyName;
        fieldChanges.push({
          field: 'companyName',
          from: existing.companyName,
          to: company.companyName,
        });
      }
      if (company.companyRegistrationId !== existing.companyRegistrationId) {
        update.companyRegistrationId = company.companyRegistrationId;
        fieldChanges.push({
          field: 'companyId',
          from: existing.companyRegistrationId,
          to: company.companyRegistrationId,
        });
      }
    }

    // What the access field means for *this* account, which is the whole
    // reason it is two values rather than five.
    const access = accessMove(row.access, existing);

    // A link asked for on an account that cannot sign in — a registration
    // nobody has decided on, or one switched off — has nowhere to land. Judged
    // against where this run leaves the account, so a row that reactivates
    // somebody and asks for their link in one go works.
    const statusAfter = access?.status ?? existing.status;
    const wantsLink = row.sendPasswordLink;
    if (wantsLink && !CAN_SIGN_IN.includes(statusAfter)) {
      fail('cannot-send-link');
    }
    // An account this run leaves able to sign in but with no password to sign
    // in *with* is mailed the link whether or not the row asked — a manager's
    // approval sends it (FR-AUTH-01), and the whole point of the exchange is
    // that there is no manager. It is a consequence of the move rather than a
    // repeatable instruction, so the next run, which moves nothing, mails
    // nothing (FR-ADM-16).
    const needsLink =
      access !== null && statusAfter === 'invited' && !existing.hasPassword;
    const sendsLink =
      needsLink || (wantsLink && CAN_SIGN_IN.includes(statusAfter));

    if (fieldChanges.length === 0 && !access && !sendsLink) {
      unchanged++;
      return;
    }

    if (fieldChanges.length > 0) {
      actions.updateAccounts.push(update);
      for (const change of fieldChanges) fieldsWritten.add(change.field);
    }
    if (access) {
      actions.setStatus.push({
        id: existing.id,
        status: access.status,
        endSessions: access.kind === 'disable',
      });
      if (access.approves) actions.approveIds.push(existing.id);
    }
    if (sendsLink) {
      actions.mailLinkIds.push(existing.id);
      mailed++;
    }

    changes.push({
      kind: access?.kind ?? 'update',
      sourceId: row.sourceId,
      email: update.email ?? existing.email,
      id: existing.id,
      changes: fieldChanges,
      mailed: sendsLink,
    });
  });

  const summary: SyncSummary = {
    rows: rows.length,
    create: count(changes, 'invite'),
    update: count(changes, 'update'),
    // The shared counters, read as this area reads them: an account switched
    // off is what a hidden product is, and one switched back on is what a
    // restored one is (ADR 0060).
    softDelete: count(changes, 'disable'),
    restore: count(changes, 'enable'),
    unchanged,
    categoriesCreated: 0,
    categoriesRenamed: 0,
    categoriesEmptied: 0,
    keptManual: 0,
    mailed,
    errors: rowErrors.length,
    fields: [...fieldsWritten],
  };

  const truncated = changes.length > SYNC_PREVIEW_MAX_ITEMS;
  return {
    plan: {
      summary,
      accounts: changes.slice(0, SYNC_PREVIEW_MAX_ITEMS),
      rowErrors: rowErrors.slice(0, SYNC_PREVIEW_MAX_ITEMS),
      truncated,
    },
    actions,
  };
}

/**
 * What one row's access field comes to for an account that exists — or null
 * where it comes to nothing, which is most rows of most runs (FR-ADM-16).
 *
 * `enabled` is three different sentences depending on where the account
 * stands: approve this registration, switch this account back on, or nothing,
 * it is already on. A reactivated account goes back to `active` when it holds
 * a password its owner chose and to `invited` when it does not — the same
 * reading `StaffUsersService.reactivate` makes, because it is the same
 * question and `active` has to keep meaning one thing everywhere.
 */
function accessMove(
  access: CustomerSyncRow['access'],
  account: ExistingAccount,
): {
  kind: 'disable' | 'enable';
  status: UserStatus;
  approves: boolean;
} | null {
  if (!access) return null;

  if (access === 'disabled') {
    return account.status === 'disabled'
      ? null
      : { kind: 'disable', status: 'disabled', approves: false };
  }

  if (account.status === 'pending') {
    return { kind: 'enable', status: 'invited', approves: true };
  }
  if (account.status === 'disabled') {
    return {
      kind: 'enable',
      status: account.hasPassword ? 'active' : 'invited',
      approves: false,
    };
  }
  return null;
}

/**
 * The invoiced party, as a set rather than three independent fields: a company
 * needs both a name and a registration id, and a customer who is not one has
 * neither. The pairing is the same one the registration form and the staff
 * editor enforce, checked against what the row and the account say *together*
 * so a run may send only the half that changed.
 *
 * Null means the row says nothing about any of it.
 */
function resolveCompany(
  row: CustomerSyncRow,
  existing: ExistingAccount | undefined,
):
  | {
      customerType: CustomerType | null;
      companyName: string | null;
      companyRegistrationId: string | null;
    }
  | 'incomplete'
  | null {
  const stated =
    row.customerType !== undefined ||
    row.companyName !== undefined ||
    row.companyRegistrationId !== undefined;
  if (!stated) return null;

  const customerType =
    row.customerType !== undefined
      ? row.customerType
      : (existing?.customerType ?? null);
  const companyName =
    row.companyName !== undefined
      ? row.companyName
      : (existing?.companyName ?? null);
  const companyRegistrationId =
    row.companyRegistrationId !== undefined
      ? row.companyRegistrationId
      : (existing?.companyRegistrationId ?? null);

  if (customerType === 'company') {
    if (!companyName || !companyRegistrationId) return 'incomplete';
    return { customerType, companyName, companyRegistrationId };
  }
  // Not a company: the invoiced-party fields go with it rather than being left
  // behind on a person, where they would still be quoted on an order.
  return {
    customerType,
    companyName: null,
    companyRegistrationId: null,
  };
}

function count(
  changes: CustomerAccountChange[],
  kind: CustomerAccountChange['kind'],
): number {
  return changes.filter((change) => change.kind === kind).length;
}

function keyOf(tiers: ExistingCustomerTier[], id: string): string | null {
  return tiers.find((tier) => tier.id === id)?.key ?? null;
}
