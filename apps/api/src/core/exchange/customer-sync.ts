/**
 * The customer differ (FR-ADM-11), pure like the catalog's. A row states
 * access as enabled or disabled; what that means for an account (approve,
 * reactivate, nothing) is decided here from its state, and the applier only
 * writes it.
 */
import {
  CustomerType,
  UserStatus,
} from '@b2b-catalog-platform/shared/core/accounts';
import {
  CustomerAccountChange,
  CustomerSyncOptions,
  CustomerSyncPlan,
  CustomerSyncRow,
  CustomerSyncRowError,
  CustomerSyncRowErrorCode,
  SYNC_PREVIEW_MAX_ITEMS,
  SyncSummary,
} from '@b2b-catalog-platform/shared/core/exchange';
import { UserRole } from '@b2b-catalog-platform/shared/platform';

/** The slice of the accounts the differ needs. */
export interface CustomerSyncState {
  accounts: ExistingAccount[];
  tiers: ExistingCustomerTier[];
  /** The kinds of customer the shop sells to (FR-AUTH-13). */
  customerTypes: readonly CustomerType[];
}

export interface ExistingCustomerTier {
  id: string;
  key: string;
}

/** Staff included: a row naming one is refused, and their addresses are
 * taken. */
export interface ExistingAccount {
  id: string;
  /** Null for an account registered here and never claimed. */
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
  /** Whether the owner chose a password: decides where reactivation lands. */
  hasPassword: boolean;
}

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

/** What the applier executes, apart from the plan a screen shows. */
export interface CustomerSyncActions {
  createAccounts: CreateAccountAction[];
  updateAccounts: UpdateAccountAction[];
  /** `endSessions` takes access away: the applier ends sessions and retires
   * open set-a-password links. */
  setStatus: { id: string; status: UserStatus; endSessions: boolean }[];
  /** First approvals, stamped like a manager's. */
  approveIds: string[];
  /** Existing accounts to mail a link; created ones are mailed anyway and
   * have no id yet. */
  mailLinkIds: string[];
  /** Adoptions (FR-ADM-17): not an edit but what a key means, so the
   * applier can skip one claimed in between. */
  claimAccounts: { id: string; sourceId: string }[];
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
  /** An uploaded file's unreadable rows (FR-ADM-12), shown in the same
   * error list. */
  parseErrors: CustomerSyncRowError[] = [],
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
  const byId = new Map(state.accounts.map((account) => [account.id, account]));
  const tierByKey = new Map(state.tiers.map((tier) => [tier.key, tier.id]));

  const actions: CustomerSyncActions = {
    createAccounts: [],
    updateAccounts: [],
    setStatus: [],
    approveIds: [],
    mailLinkIds: [],
    claimAccounts: [],
  };
  const changes: CustomerAccountChange[] = [];
  const rowErrors: CustomerSyncRowError[] = [...parseErrors];
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

    // The account holding the key, or one the run may claim (FR-ADM-17).
    const byKey = bySourceId.get(row.sourceId);

    // Only where the key is unknown: an id disagreeing with a key is stale
    // (FR-ADM-14).
    const named = !byKey && row.accountId ? byId.get(row.accountId) : undefined;
    if (!byKey && row.accountId) {
      // Before the options: "claiming was off" would send an operator to a
      // setting that refuses these too.
      if (!named) return fail('account-unknown', { accountId: row.accountId });
      if (named.role !== 'user') return fail('staff-account');
      if (named.status === 'anonymized') return fail('account-withdrawn');
      if (named.sourceId !== null) {
        return fail('account-already-keyed', { accountId: row.accountId });
      }
    }
    const claimedById = options.claimById ? unclaimedHolder(named) : undefined;

    const unclaimed =
      !byKey && row.email ? unclaimedHolder(byEmail.get(row.email)) : undefined;
    // The id wins over the address: the sender chose it.
    const claimed =
      claimedById ?? (options.claimByEmail ? unclaimed : undefined);

    // After the address, so a run claiming by address is not refused for an
    // id reaching the same account.
    if (named && !claimed) {
      return fail('account-unclaimed-by-id', {
        accountId: row.accountId as string,
        email: named.email,
      });
    }
    const existing = byKey ?? claimed;

    // Or the exchange could tier, disable or re-mail an admin.
    if (existing && existing.role !== 'user') return fail('staff-account');

    // Closed by its owner (FR-AUTH-06): it kept its key for this refusal, or
    // the next run would invite them again.
    if (existing && existing.status === 'anonymized') {
      return fail('account-withdrawn');
    }

    // Checked against every account, staff included.
    const email = writes.has('email') || !existing ? row.email : undefined;
    if (email) {
      const holder = byEmail.get(email);
      if (holder && holder.id !== existing?.id) {
        if (holder.role !== 'user') return fail('staff-account', { email });
        // A claimable holder is almost certainly this person, registered on
        // the storefront: name the option that was off, not a clash.
        if (!byKey && unclaimedHolder(holder)) {
          return fail('account-unclaimed', { email });
        }
        return fail(
          holder.status === 'anonymized' ? 'account-withdrawn' : 'email-taken',
          { email },
        );
      }
      if (claimedEmails.has(email) && email !== existing?.email) {
        return fail('duplicate-email', { email });
      }
      claimedEmails.add(email);
    }

    // Null is the base list; an unknown key fails rather than falling back.
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
    // Only a stated type is checked, so an older account is not refused every
    // run. A stated null is a person.
    if (row.customerType !== undefined) {
      const type = row.customerType ?? 'person';
      if (!state.customerTypes.includes(type)) {
        return fail('customer-type-not-accepted', { type });
      }
    }

    if (!existing) {
      // Only a row granting access creates an account.
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

    // A matching value is no change: a feed resends its whole record every run
    // (FR-ADM-16).
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

    const access = accessMove(row.access, existing);

    // Judged by where the run leaves the account, so reactivating and asking
    // for a link in one row works.
    const statusAfter = access?.status ?? existing.status;
    const wantsLink = row.sendPasswordLink;
    if (wantsLink && !CAN_SIGN_IN.includes(statusAfter)) {
      fail('cannot-send-link');
    }
    // Moved to `invited` without a password: mailed unasked, as a manager's
    // approval would (FR-AUTH-01). Only on the move, so a repeat run mails
    // nothing (FR-ADM-16).
    const needsLink =
      access !== null && statusAfter === 'invited' && !existing.hasPassword;
    const sendsLink =
      needsLink || (wantsLink && CAN_SIGN_IN.includes(statusAfter));

    const claims = existing === claimed;
    const claimsById = claims && existing === claimedById;
    if (!claims && fieldChanges.length === 0 && !access && !sendsLink) {
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
    if (claims) {
      actions.claimAccounts.push({ id: existing.id, sourceId: row.sourceId });
    }

    changes.push({
      // A claim outranks the move it arrives with: it is the news.
      kind: claims
        ? claimsById
          ? 'claim-id'
          : 'claim'
        : (access?.kind ?? 'update'),
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
    // The shared counters: disabled counts as deleted, enabled as restored.
    softDelete: count(changes, 'disable'),
    restore: count(changes, 'enable'),
    claimed: count(changes, 'claim'),
    claimedById: count(changes, 'claim-id'),
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

/** A row's access for an existing account, or null for no move. A
 * reactivated account lands where `StaffUsersService.reactivate` puts it. */
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

/** The invoiced party as a set: a company needs a name and an id, others
 * have neither. Row and account are read together, so a row may send only the
 * half that changed. Null when the row says nothing. */
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
  // Cleared, or a person's orders would still quote them.
  return {
    customerType,
    companyName: null,
    companyRegistrationId: null,
  };
}

/** An account a row may adopt (FR-ADM-17): a keyless customer, not
 * withdrawn. Staff and withdrawn ones meet their own refusals. */
function unclaimedHolder(
  holder: ExistingAccount | undefined,
): ExistingAccount | undefined {
  if (!holder) return undefined;
  if (holder.role !== 'user') return undefined;
  if (holder.status === 'anonymized') return undefined;
  return holder.sourceId === null ? holder : undefined;
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
