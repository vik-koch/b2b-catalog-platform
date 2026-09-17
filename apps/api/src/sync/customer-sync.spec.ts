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
  ...over,
});

const row = (over: Partial<CustomerSyncRow> = {}): CustomerSyncRow => ({
  sourceId: 'C-1',
  sendPasswordLink: false,
  ...over,
});

describe('planCustomerSync', () => {
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
