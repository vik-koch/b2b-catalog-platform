import {
  CUSTOMER_SYNC_FIELDS,
  CustomerSyncOptions,
  CustomerSyncRow,
} from '@b2b-catalog-platform/shared';
import {
  CustomerSyncState,
  ExistingAccount,
  planCustomerSync,
} from './customer-sync';

const wholesale = { id: 'tier-w', key: 'wholesale' };
const trade = { id: 'tier-t', key: 'trade' };

const account = (over: Partial<ExistingAccount> = {}): ExistingAccount => ({
  id: 'u-1',
  sourceId: 'C-1',
  email: 'ada@example.com',
  role: 'user',
  status: 'active',
  tierId: null,
  tierKey: null,
  customerType: null,
  companyName: null,
  companyRegistrationId: null,
  hasPassword: true,
  ...over,
});

const state = (over: Partial<CustomerSyncState> = {}): CustomerSyncState => ({
  accounts: [account()],
  tiers: [wholesale, trade],
  ...over,
});

const options = (
  over: Partial<CustomerSyncOptions> = {},
): CustomerSyncOptions => ({
  fields: [...CUSTOMER_SYNC_FIELDS],
  createMissing: true,
  updateExisting: true,
  claimByEmail: false,
  claimById: false,
  ...over,
});

const row = (over: Partial<CustomerSyncRow> = {}): CustomerSyncRow => ({
  sourceId: 'C-1',
  sendPasswordLink: false,
  ...over,
});

describe('planCustomerSync', () => {
  describe('rows a file could not be read at all (FR-ADM-12)', () => {
    it('carries them into the plan and counts them as errors', () => {
      // An admin reading a preview is owed one list of what this file will not
      // do, not one from the parser and another from here.
      const { plan } = planCustomerSync(
        [row({ access: 'disabled' })],
        options(),
        state(),
        [{ row: 4, sourceId: 'C-9', code: 'invalid-value' }],
      );

      expect(plan.rowErrors).toEqual([
        { row: 4, sourceId: 'C-9', code: 'invalid-value' },
      ]);
      expect(plan.summary).toMatchObject({ errors: 1, softDelete: 1 });
    });

    it('makes a file of nothing but bad rows a run that happened', () => {
      // The opposite of a quiet night: filing it as no change would hide the
      // one thing the log exists to show.
      const { plan } = planCustomerSync([], options(), state(), [
        { row: 1, sourceId: null, code: 'missing-source-id' },
      ]);

      expect(plan.summary).toMatchObject({ rows: 0, errors: 1 });
    });
  });

  describe('claiming an account somebody registered here (FR-ADM-17)', () => {
    /** The deadlock this exists for: registered on the storefront, no source
     * key, so nothing the exchange sends can ever reach them. */
    const selfRegistered = (over: Partial<ExistingAccount> = {}) =>
      account({
        id: 'u-new',
        sourceId: null,
        email: 'grace@example.com',
        status: 'pending',
        hasPassword: false,
        ...over,
      });

    it('refuses the row with its own code while the option is off', () => {
      // `email-taken` would be true about the data and false about the
      // situation: it is the same person, and what is needed is a claim.
      const { plan, actions } = planCustomerSync(
        [
          row({
            sourceId: 'C-9',
            email: 'grace@example.com',
            access: 'enabled',
          }),
        ],
        options(),
        state({ accounts: [selfRegistered()] }),
      );

      expect(plan.rowErrors).toEqual([
        {
          row: 1,
          sourceId: 'C-9',
          code: 'account-unclaimed',
          params: { email: 'grace@example.com' },
        },
      ]);
      expect(actions.createAccounts).toEqual([]);
      expect(actions.claimAccounts).toEqual([]);
    });

    it('adopts the account and approves it in one row while it is on', () => {
      const { plan, actions } = planCustomerSync(
        [
          row({
            sourceId: 'C-9',
            email: 'grace@example.com',
            access: 'enabled',
            tierKey: 'wholesale',
          }),
        ],
        options({ claimByEmail: true }),
        state({ accounts: [selfRegistered()] }),
      );

      expect(actions.claimAccounts).toEqual([{ id: 'u-new', sourceId: 'C-9' }]);
      expect(actions.createAccounts).toEqual([]);
      expect(actions.approveIds).toEqual(['u-new']);
      expect(actions.setStatus).toEqual([
        { id: 'u-new', status: 'invited', endSessions: false },
      ]);
      // The kind a reader needs is the adoption, not the approval every other
      // row of the run is also doing — and the tier still travels with it.
      expect(plan.accounts).toEqual([
        {
          kind: 'claim',
          sourceId: 'C-9',
          email: 'grace@example.com',
          id: 'u-new',
          changes: [{ field: 'tier', from: null, to: 'wholesale' }],
          mailed: true,
        },
      ]);
      expect(plan.summary).toMatchObject({ claimed: 1, create: 0, mailed: 1 });
    });

    it('is a change in its own right, even when the row asks for nothing else', () => {
      // Giving an account its key is what makes every later run able to reach
      // it, so a run that does only that is not a quiet night.
      const { plan, actions } = planCustomerSync(
        [row({ sourceId: 'C-9', email: 'grace@example.com' })],
        options({ claimByEmail: true }),
        state({ accounts: [selfRegistered({ status: 'active' })] }),
      );

      expect(actions.claimAccounts).toEqual([{ id: 'u-new', sourceId: 'C-9' }]);
      expect(plan.summary).toMatchObject({ claimed: 1, unchanged: 0 });
    });

    it('never claims a staff account', () => {
      // Staff are not customers under any setting, and the refusal says so by
      // name rather than the account being quietly adopted.
      const { plan, actions } = planCustomerSync(
        [
          row({
            sourceId: 'C-9',
            email: 'boss@example.com',
            access: 'enabled',
          }),
        ],
        options({ claimByEmail: true }),
        state({
          accounts: [
            selfRegistered({
              id: 'u-staff',
              email: 'boss@example.com',
              role: 'admin',
            }),
          ],
        }),
      );

      expect(actions.claimAccounts).toEqual([]);
      expect(plan.rowErrors[0]).toMatchObject({ code: 'staff-account' });
    });

    it('never claims an account the person closed themselves', () => {
      const { plan, actions } = planCustomerSync(
        [
          row({
            sourceId: 'C-9',
            email: 'gone@example.com',
            access: 'enabled',
          }),
        ],
        options({ claimByEmail: true }),
        state({
          accounts: [
            selfRegistered({
              id: 'u-gone',
              email: 'gone@example.com',
              status: 'anonymized',
            }),
          ],
        }),
      );

      expect(actions.claimAccounts).toEqual([]);
      expect(actions.createAccounts).toEqual([]);
      // Refused as closed, not as unclaimed: pointing at an option that would
      // refuse it too is worse than saying nothing.
      expect(plan.rowErrors[0]).toMatchObject({ code: 'account-withdrawn' });
    });

    it("stays an ordinary collision when the row's own key is already spoken for", () => {
      // Claiming cannot help here: this key names one account and the address
      // names another, and only a person can say which is meant.
      const { plan } = planCustomerSync(
        [row({ sourceId: 'C-1', email: 'grace@example.com' })],
        options({ claimByEmail: true }),
        state({ accounts: [account(), selfRegistered()] }),
      );

      expect(plan.rowErrors[0]).toMatchObject({ code: 'email-taken' });
    });
  });

  describe('claiming by the account identifier (FR-ADM-17)', () => {
    /** The identifier is the one handle a keyless account has, and the one the
     * outward read hands out (FR-ADM-18). */
    const selfRegistered = (over: Partial<ExistingAccount> = {}) =>
      account({
        id: 'u-new',
        sourceId: null,
        email: 'grace@example.com',
        status: 'pending',
        hasPassword: false,
        ...over,
      });

    const namedRow = (over: Partial<CustomerSyncRow> = {}) =>
      row({ sourceId: 'C-9', accountId: 'u-new', access: 'enabled', ...over });

    it('adopts the account the row named, and counts it apart', () => {
      const { plan, actions } = planCustomerSync(
        [namedRow({ tierKey: 'wholesale' })],
        options({ claimById: true }),
        state({ accounts: [selfRegistered()] }),
      );

      expect(actions.claimAccounts).toEqual([{ id: 'u-new', sourceId: 'C-9' }]);
      expect(plan.accounts[0]).toMatchObject({ kind: 'claim-id', id: 'u-new' });
      // Its own count, because its own ceiling decides whether a run carrying
      // it may apply itself.
      expect(plan.summary).toMatchObject({ claimedById: 1, claimed: 0 });
    });

    it('needs no address to find the account', () => {
      // The whole point over the address match: the source need not know, or
      // agree about, what the person signs in with.
      const { actions } = planCustomerSync(
        [namedRow()],
        options({ claimById: true }),
        state({ accounts: [selfRegistered()] }),
      );

      expect(actions.claimAccounts).toEqual([{ id: 'u-new', sourceId: 'C-9' }]);
    });

    it('points at the switch that was off, not at the address one', () => {
      const { plan, actions } = planCustomerSync(
        [namedRow()],
        options({ claimByEmail: true }),
        state({ accounts: [selfRegistered()] }),
      );

      expect(plan.rowErrors).toEqual([
        {
          row: 1,
          sourceId: 'C-9',
          code: 'account-unclaimed-by-id',
          params: { accountId: 'u-new', email: 'grace@example.com' },
        },
      ]);
      expect(actions.claimAccounts).toEqual([]);
    });

    it('lets the address claim it where the row carries both and only that is on', () => {
      // A row naming the same account twice over is not refused for carrying
      // the extra field: the run was allowed to reach this account.
      const { plan, actions } = planCustomerSync(
        [namedRow({ email: 'grace@example.com' })],
        options({ claimByEmail: true }),
        state({ accounts: [selfRegistered()] }),
      );

      expect(plan.rowErrors).toEqual([]);
      expect(actions.claimAccounts).toEqual([{ id: 'u-new', sourceId: 'C-9' }]);
      expect(plan.summary).toMatchObject({ claimed: 1, claimedById: 0 });
    });

    it('refuses an identifier that names nothing, rather than guessing from the address', () => {
      const { plan, actions } = planCustomerSync(
        [namedRow({ accountId: 'u-gone', email: 'grace@example.com' })],
        options({ claimById: true, claimByEmail: true }),
        state({ accounts: [selfRegistered()] }),
      );

      expect(plan.rowErrors).toEqual([
        {
          row: 1,
          sourceId: 'C-9',
          code: 'account-unknown',
          params: { accountId: 'u-gone' },
        },
      ]);
      expect(actions.claimAccounts).toEqual([]);
    });

    it('refuses an account that already answers to a key', () => {
      const { plan } = planCustomerSync(
        [namedRow({ accountId: 'u-1' })],
        options({ claimById: true }),
        state({ accounts: [account(), selfRegistered()] }),
      );

      expect(plan.rowErrors).toEqual([
        {
          row: 1,
          sourceId: 'C-9',
          code: 'account-already-keyed',
          params: { accountId: 'u-1' },
        },
      ]);
    });

    it('refuses a staff account and a withdrawn one by name', () => {
      const staff = selfRegistered({ id: 'u-staff', role: 'admin' });
      const gone = selfRegistered({
        id: 'u-gone',
        status: 'anonymized',
        email: 'deleted@deleted.invalid',
      });

      const { plan } = planCustomerSync(
        [
          namedRow({ accountId: 'u-staff' }),
          namedRow({ sourceId: 'C-10', accountId: 'u-gone' }),
        ],
        options({ claimById: true }),
        state({ accounts: [staff, gone] }),
      );

      expect(plan.rowErrors.map((e) => e.code)).toEqual([
        'staff-account',
        'account-withdrawn',
      ]);
    });

    it('is ignored once the key names an account of its own (FR-ADM-14)', () => {
      // Identity is the key from here on; an identifier disagreeing with it is
      // a stale mapping, not an instruction.
      const { plan, actions } = planCustomerSync(
        [row({ sourceId: 'C-1', accountId: 'u-new', tierKey: 'trade' })],
        options({ claimById: true }),
        state({ accounts: [account(), selfRegistered()] }),
      );

      expect(plan.rowErrors).toEqual([]);
      expect(actions.claimAccounts).toEqual([]);
      expect(actions.updateAccounts).toEqual([
        expect.objectContaining({ id: 'u-1' }),
      ]);
    });
  });

  describe('a run that changes nothing', () => {
    it('reports an account whose details already match as unchanged', () => {
      const { plan, actions } = planCustomerSync(
        [row({ email: 'ada@example.com', access: 'enabled' })],
        options(),
        state(),
      );

      expect(plan.summary).toMatchObject({ unchanged: 1, update: 0, rows: 1 });
      expect(plan.accounts).toEqual([]);
      expect(actions.updateAccounts).toEqual([]);
      expect(actions.setStatus).toEqual([]);
    });

    it('treats `enabled` on an account that can already sign in as nothing', () => {
      const { plan } = planCustomerSync(
        [row({ access: 'enabled' })],
        options(),
        state({ accounts: [account({ status: 'invited' })] }),
      );

      expect(plan.summary).toMatchObject({ unchanged: 1, restore: 0 });
    });

    it('treats `disabled` on an account already switched off as nothing', () => {
      const { plan } = planCustomerSync(
        [row({ access: 'disabled' })],
        options(),
        state({ accounts: [account({ status: 'disabled' })] }),
      );

      expect(plan.summary).toMatchObject({ unchanged: 1, softDelete: 0 });
    });
  });

  describe('inviting an account into being', () => {
    it('creates an unknown customer that asks for access, and mails them', () => {
      const { plan, actions } = planCustomerSync(
        [
          row({
            sourceId: 'C-9',
            email: 'grace@example.com',
            access: 'enabled',
            firstName: 'Grace',
            lastName: 'Hopper',
            tierKey: 'wholesale',
          }),
        ],
        options(),
        state(),
      );

      expect(plan.summary).toMatchObject({ create: 1, mailed: 1, errors: 0 });
      expect(actions.createAccounts).toEqual([
        {
          sourceId: 'C-9',
          email: 'grace@example.com',
          firstName: 'Grace',
          lastName: 'Hopper',
          phone: null,
          tierId: 'tier-w',
          customerType: null,
          companyName: null,
          companyRegistrationId: null,
        },
      ]);
      expect(plan.accounts[0]).toMatchObject({ kind: 'invite', mailed: true });
    });

    it('leaves an unknown customer that asks for nothing alone', () => {
      const { plan, actions } = planCustomerSync(
        [row({ sourceId: 'C-9', email: 'grace@example.com' })],
        options(),
        state(),
      );

      expect(plan.summary).toMatchObject({ create: 0, errors: 0 });
      expect(actions.createAccounts).toEqual([]);
    });

    it('refuses to create one with no address to mail', () => {
      const { plan } = planCustomerSync(
        [row({ sourceId: 'C-9', access: 'enabled' })],
        options(),
        state(),
      );

      expect(plan.rowErrors).toEqual([
        { row: 1, sourceId: 'C-9', code: 'cannot-create-account' },
      ]);
    });

    it('refuses to create one when the run may not create', () => {
      const { plan } = planCustomerSync(
        [row({ sourceId: 'C-9', email: 'g@example.com', access: 'enabled' })],
        options({ createMissing: false }),
        state(),
      );

      expect(plan.rowErrors[0].code).toBe('cannot-create-account');
    });
  });

  describe('access', () => {
    it('approves a registration that is waiting for a decision', () => {
      const { plan, actions } = planCustomerSync(
        [row({ access: 'enabled' })],
        options(),
        state({ accounts: [account({ status: 'pending' })] }),
      );

      expect(plan.summary).toMatchObject({ restore: 1 });
      expect(actions.setStatus).toEqual([
        { id: 'u-1', status: 'invited', endSessions: false },
      ]);
      expect(actions.approveIds).toEqual(['u-1']);
    });

    it('mails the link to a registration it approves', () => {
      const { plan, actions } = planCustomerSync(
        [row({ access: 'enabled' })],
        options(),
        state({
          accounts: [account({ status: 'pending', hasPassword: false })],
        }),
      );

      // A manager's approval sends this mail (FR-AUTH-01), and the point of
      // the exchange is that there is no manager to press the button.
      expect(actions.mailLinkIds).toEqual(['u-1']);
      expect(plan.summary.mailed).toBe(1);
      expect(plan.accounts[0].mailed).toBe(true);
    });

    it('tells nobody when it switches on an account that has a password', () => {
      const { plan, actions } = planCustomerSync(
        [row({ access: 'enabled' })],
        options(),
        state({ accounts: [account({ status: 'disabled' })] }),
      );

      expect(actions.mailLinkIds).toEqual([]);
      expect(plan.summary.mailed).toBe(0);
    });

    it('switches a disabled account back on, to active where it has a password', () => {
      const { actions } = planCustomerSync(
        [row({ access: 'enabled' })],
        options(),
        state({ accounts: [account({ status: 'disabled' })] }),
      );

      expect(actions.setStatus).toEqual([
        { id: 'u-1', status: 'active', endSessions: false },
      ]);
      // Nothing to approve: the account was approved when it was first let in,
      // and none of that stopped being true.
      expect(actions.approveIds).toEqual([]);
    });

    it('switches one back on as invited where it never chose a password', () => {
      const { actions } = planCustomerSync(
        [row({ access: 'enabled' })],
        options(),
        state({
          accounts: [account({ status: 'disabled', hasPassword: false })],
        }),
      );

      expect(actions.setStatus[0].status).toBe('invited');
    });

    it('switches an account off and ends its sessions', () => {
      const { plan, actions } = planCustomerSync(
        [row({ access: 'disabled' })],
        options(),
        state(),
      );

      expect(plan.summary).toMatchObject({ softDelete: 1 });
      expect(actions.setStatus).toEqual([
        { id: 'u-1', status: 'disabled', endSessions: true },
      ]);
    });

    it('refuses a registration by switching it off rather than deleting it', () => {
      const { plan, actions } = planCustomerSync(
        [row({ access: 'disabled' })],
        options(),
        state({ accounts: [account({ status: 'pending' })] }),
      );

      expect(plan.accounts[0].kind).toBe('disable');
      expect(actions.setStatus[0]).toMatchObject({ status: 'disabled' });
    });
  });

  describe('what the exchange may not touch', () => {
    it('refuses a row that names a staff account', () => {
      const { plan, actions } = planCustomerSync(
        [row({ access: 'disabled' })],
        options(),
        state({ accounts: [account({ role: 'admin' })] }),
      );

      expect(plan.rowErrors[0].code).toBe('staff-account');
      expect(actions.setStatus).toEqual([]);
    });

    it('refuses a row for an account the person deleted themselves', () => {
      const { plan, actions } = planCustomerSync(
        [row({ email: 'new@example.com', access: 'enabled' })],
        options(),
        state({ accounts: [account({ status: 'anonymized' })] }),
      );

      expect(plan.rowErrors[0].code).toBe('account-withdrawn');
      expect(actions.createAccounts).toEqual([]);
      expect(actions.setStatus).toEqual([]);
    });

    it('ignores a name and a phone number on an account that exists', () => {
      const { plan, actions } = planCustomerSync(
        [row({ firstName: 'Someone', lastName: 'Else', phone: '+49 100' })],
        options(),
        state(),
      );

      expect(plan.summary).toMatchObject({ unchanged: 1, update: 0 });
      expect(actions.updateAccounts).toEqual([]);
    });
  });

  describe('details', () => {
    it('moves a customer onto another price list', () => {
      const { plan, actions } = planCustomerSync(
        [row({ tierKey: 'trade' })],
        options(),
        state({
          accounts: [account({ tierId: 'tier-w', tierKey: 'wholesale' })],
        }),
      );

      expect(plan.accounts[0].changes).toEqual([
        { field: 'tier', from: 'wholesale', to: 'trade' },
      ]);
      expect(actions.updateAccounts).toEqual([{ id: 'u-1', tierId: 'tier-t' }]);
      expect(plan.summary.fields).toEqual(['tier']);
    });

    it('moves one back to the base list', () => {
      const { actions } = planCustomerSync(
        [row({ tierKey: null })],
        options(),
        state({
          accounts: [account({ tierId: 'tier-w', tierKey: 'wholesale' })],
        }),
      );

      expect(actions.updateAccounts).toEqual([{ id: 'u-1', tierId: null }]);
    });

    it('refuses a price list nobody has', () => {
      const { plan } = planCustomerSync(
        [row({ tierKey: 'platinum' })],
        options(),
        state(),
      );

      expect(plan.rowErrors[0]).toMatchObject({
        code: 'unknown-tier',
        params: { key: 'platinum', known: 'wholesale, trade' },
      });
    });

    it('writes the invoiced party as a set', () => {
      const { actions } = planCustomerSync(
        [
          row({
            customerType: 'company',
            companyName: 'Hopper GmbH',
            companyRegistrationId: 'DE123',
          }),
        ],
        options(),
        state(),
      );

      expect(actions.updateAccounts[0]).toMatchObject({
        customerType: 'company',
        companyName: 'Hopper GmbH',
        companyRegistrationId: 'DE123',
      });
    });

    it('refuses a company with half its details', () => {
      const { plan } = planCustomerSync(
        [row({ customerType: 'company', companyName: 'Hopper GmbH' })],
        options(),
        state(),
      );

      expect(plan.rowErrors[0].code).toBe('company-details-incomplete');
    });

    it('accepts the half that changed where the account holds the rest', () => {
      const { actions } = planCustomerSync(
        [row({ companyName: 'Hopper AG' })],
        options(),
        state({
          accounts: [
            account({
              customerType: 'company',
              companyName: 'Hopper GmbH',
              companyRegistrationId: 'DE123',
            }),
          ],
        }),
      );

      expect(actions.updateAccounts).toEqual([
        { id: 'u-1', companyName: 'Hopper AG' },
      ]);
    });

    it('clears the invoiced party when a customer stops being a company', () => {
      const { actions } = planCustomerSync(
        [row({ customerType: null })],
        options(),
        state({
          accounts: [
            account({
              customerType: 'company',
              companyName: 'Hopper GmbH',
              companyRegistrationId: 'DE123',
            }),
          ],
        }),
      );

      expect(actions.updateAccounts[0]).toMatchObject({
        customerType: null,
        companyName: null,
        companyRegistrationId: null,
      });
    });

    it('rewrites an address, which nobody else can', () => {
      const { plan, actions } = planCustomerSync(
        [row({ email: 'ada@lovelace.example' })],
        options(),
        state(),
      );

      expect(plan.accounts[0].changes).toEqual([
        {
          field: 'email',
          from: 'ada@example.com',
          to: 'ada@lovelace.example',
        },
      ]);
      expect(actions.updateAccounts[0].email).toBe('ada@lovelace.example');
    });

    it('refuses an address another account holds', () => {
      const { plan } = planCustomerSync(
        [row({ sourceId: 'C-2', email: 'ada@example.com', access: 'enabled' })],
        options(),
        state(),
      );

      expect(plan.rowErrors[0]).toMatchObject({
        code: 'email-taken',
        params: { email: 'ada@example.com' },
      });
    });

    it('refuses an address a staff account holds', () => {
      const { plan } = planCustomerSync(
        [
          row({
            sourceId: 'C-2',
            email: 'boss@example.com',
            access: 'enabled',
          }),
        ],
        options(),
        state({
          accounts: [
            account(),
            account({
              id: 'u-2',
              sourceId: null,
              email: 'boss@example.com',
              role: 'admin',
            }),
          ],
        }),
      );

      expect(plan.rowErrors[0].code).toBe('staff-account');
    });

    it('refuses two rows claiming one address', () => {
      const { plan } = planCustomerSync(
        [
          row({ sourceId: 'C-8', email: 'new@example.com', access: 'enabled' }),
          row({ sourceId: 'C-9', email: 'new@example.com', access: 'enabled' }),
        ],
        options(),
        state(),
      );

      expect(plan.summary.create).toBe(1);
      expect(plan.rowErrors).toEqual([
        {
          row: 2,
          sourceId: 'C-9',
          code: 'duplicate-email',
          params: { email: 'new@example.com' },
        },
      ]);
    });

    it('uses only the first row for a repeated sourceId', () => {
      const { plan } = planCustomerSync(
        [row({ tierKey: 'wholesale' }), row({ tierKey: 'trade' })],
        options(),
        state(),
      );

      expect(plan.summary.update).toBe(1);
      expect(plan.rowErrors[0].code).toBe('duplicate-source-id');
    });
  });

  describe('sending a link again', () => {
    it('sends one to an account that can sign in', () => {
      const { plan, actions } = planCustomerSync(
        [row({ sendPasswordLink: true })],
        options(),
        state(),
      );

      expect(actions.mailLinkIds).toEqual(['u-1']);
      expect(plan.summary).toMatchObject({ mailed: 1, update: 1 });
      expect(plan.accounts[0]).toMatchObject({ kind: 'update', mailed: true });
    });

    it('sends one to an account the same run switches on', () => {
      const { actions } = planCustomerSync(
        [row({ access: 'enabled', sendPasswordLink: true })],
        options(),
        state({ accounts: [account({ status: 'pending' })] }),
      );

      expect(actions.mailLinkIds).toEqual(['u-1']);
    });

    it('refuses one for an account that cannot sign in', () => {
      const { plan, actions } = planCustomerSync(
        [row({ sendPasswordLink: true })],
        options(),
        state({ accounts: [account({ status: 'disabled' })] }),
      );

      expect(actions.mailLinkIds).toEqual([]);
      expect(plan.rowErrors[0].code).toBe('cannot-send-link');
    });
  });

  describe('what a run may write', () => {
    it('leaves the tier alone when the run does not write tiers', () => {
      const { plan, actions } = planCustomerSync(
        [row({ tierKey: 'trade' })],
        options({ fields: ['email', 'company'] }),
        state(),
      );

      expect(plan.summary).toMatchObject({ unchanged: 1 });
      expect(actions.updateAccounts).toEqual([]);
    });

    it('still moves access when the run writes no fields at all', () => {
      const { actions } = planCustomerSync(
        [row({ access: 'disabled' })],
        options({ fields: [] }),
        state(),
      );

      expect(actions.setStatus[0]).toMatchObject({ status: 'disabled' });
    });

    it('touches nothing that exists when the run may not update', () => {
      const { plan, actions } = planCustomerSync(
        [row({ access: 'disabled', tierKey: 'trade' })],
        options({ updateExisting: false }),
        state(),
      );

      expect(plan.summary).toMatchObject({ unchanged: 1 });
      expect(actions.setStatus).toEqual([]);
    });
  });

  it('reports a missing key rather than guessing at one', () => {
    const { plan } = planCustomerSync(
      [{ sourceId: '', sendPasswordLink: false }],
      options(),
      state(),
    );

    expect(plan.rowErrors).toEqual([
      { row: 1, sourceId: null, code: 'missing-source-id' },
    ]);
  });
});
