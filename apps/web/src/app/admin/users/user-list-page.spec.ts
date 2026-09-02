import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import {
  CustomerTier,
  StaffUser,
  UserKind,
} from '@b2b-catalog-platform/shared';
import { ADMIN_TEXT } from '../../config/admin-text';
import { defaultAdminText } from '../../config/admin-text.fixture';
import { DEPLOYMENT_CONFIG } from '../../config/deployment-config';
import { defaultDeploymentConfig } from '../../config/deployment-config.fixture';
import { AuthService } from '../../auth/auth.service';
import { ConfirmService } from '../../ui/confirm.service';
import { TiersService } from '../tiers/tiers.service';
import { UserListPage } from './user-list-page';
import { StaffUsersService } from './users.service';

const text = defaultAdminText.userList;

function user(overrides: Partial<StaffUser> = {}): StaffUser {
  return {
    id: 'u1',
    email: 'jane@example.com',
    role: 'user',
    status: 'active',
    firstName: 'Jane',
    lastName: 'Doe',
    phone: '+49 40 1234567',
    customerType: 'person',
    companyName: null,
    companyRegistrationId: null,
    tierId: null,
    createdAt: '2026-08-01T00:00:00.000Z',
    approvedAt: '2026-08-02T00:00:00.000Z',
    approvedBy: 'admin-1',
    ...overrides,
  };
}

function tier(overrides: Partial<CustomerTier> = {}): CustomerTier {
  return {
    id: 'tier-1',
    key: 'wholesale',
    label: 'Wholesale',
    userCount: 0,
    priceCount: 0,
    sortOrder: 0,
    updatedAt: '2026-08-01T00:00:00.000Z',
    ...overrides,
  };
}

async function render(
  options: {
    users?: StaffUser[];
    tiers?: CustomerTier[];
    kind?: UserKind;
    role?: 'admin' | 'manager';
    confirmed?: boolean;
    /** Overrides the demo deployment, for the multi-format cases. */
    config?: unknown;
  } = {},
) {
  const service = {
    list: vi.fn(async () => options.users ?? []),
    remove: vi.fn<StaffUsersService['remove']>(async () => ({ ok: true })),
    setActive: vi.fn<StaffUsersService['setActive']>(async () => ({
      ok: true,
      user: user(),
    })),
  };
  const tiers = {
    list: vi.fn(async () => ({
      tiers: options.tiers ?? [],
      defaultUserCount: 0,
    })),
  };
  const auth = { user: () => ({ role: options.role ?? 'admin' }) };
  const confirm = { ask: vi.fn(async () => options.confirmed ?? true) };

  // Some cases render both views to compare them, so start each render from a
  // clean module rather than reconfiguring an instantiated one.
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [UserListPage],
    providers: [
      provideRouter([]),
      { provide: ADMIN_TEXT, useValue: defaultAdminText },
      {
        provide: DEPLOYMENT_CONFIG,
        useValue: options.config ?? defaultDeploymentConfig,
      },
      { provide: AuthService, useValue: auth },
      { provide: ConfirmService, useValue: confirm },
      { provide: StaffUsersService, useValue: service },
      { provide: TiersService, useValue: tiers },
    ],
  });
  const fixture = TestBed.createComponent(UserListPage);
  if (options.kind) fixture.componentRef.setInput('kind', options.kind);
  await fixture.whenStable();
  fixture.detectChanges();

  const el = fixture.nativeElement as HTMLElement;
  const settle = async () => {
    await fixture.whenStable();
    fixture.detectChanges();
  };
  const setInput = async (name: string, value: string) => {
    fixture.componentRef.setInput(name, value);
    await settle();
  };
  /** The name, which shares its cell with the email — the first line of it. */
  const names = () =>
    [...el.querySelectorAll('tbody tr')].map((row) =>
      row.querySelector('td span')?.textContent?.trim(),
    );

  /** Click a row action button by its text or aria-label. */
  const rowAction = async (label: string) => {
    const button = [...el.querySelectorAll('tbody button')].find(
      (b) =>
        b.textContent?.trim() === label ||
        b.getAttribute('aria-label') === label,
    ) as HTMLButtonElement | undefined;
    if (!button) throw new Error(`no row action "${label}"`);
    button.click();
    await settle();
  };

  /** Where a link-shaped row action points, by accessible name. The `?from=`
   * return param is asserted on its own, not repeated in every path. */
  const rowLink = (label: string) => {
    const link = [...el.querySelectorAll('tbody a')].find(
      (a) => a.getAttribute('aria-label') === label,
    ) as HTMLAnchorElement | undefined;
    return (
      link && {
        path: link.getAttribute('href')?.split('?')[0],
        href: link.getAttribute('href'),
      }
    );
  };

  return {
    el,
    service,
    tiers,
    confirm,
    fixture,
    setInput,
    names,
    rowAction,
    rowLink,
  };
}

describe('UserListPage', () => {
  it('renders an account: name last-first, email, status and tier', async () => {
    const { el } = await render({
      users: [user({ tierId: 'tier-1' })],
      tiers: [tier({ id: 'tier-1', label: 'Wholesale' })],
    });

    const row = el.querySelector('tbody tr');
    expect(row?.textContent).toContain('Doe, Jane');
    expect(row?.textContent).toContain('jane@example.com');
    expect(row?.textContent).toContain(text.statusActive);
    expect(row?.textContent).toContain('Wholesale');
  });

  // The cells of a row are written by the page and the columns are declared
  // beside them, so nothing but this holds the two lists to the same length —
  // and this component has two column sets, one per kind.
  it('draws one cell per declared column, on both lists', async () => {
    for (const kind of ['customer', 'staff'] as const) {
      const { el } = await render({ kind, users: [user()] });

      const headings = el.querySelectorAll('thead th').length;
      expect(headings).toBeGreaterThan(0);
      expect(el.querySelectorAll('tbody tr td').length).toBe(headings);
    }
  });

  it('names the base price list for an account with no tier', async () => {
    const { el } = await render({ users: [user({ tierId: null })] });

    // The same wording the tier list gives its first row, not a blank cell.
    expect(el.querySelector('tbody tr')?.textContent).toContain(
      defaultAdminText.tierList.defaultLabel,
    );
  });

  it('distinguishes an empty deployment from an emptied filter', async () => {
    const { el, setInput } = await render({ users: [] });
    expect(el.textContent).toContain(text.empty);

    await setInput('status', 'pending');
    expect(el.textContent).toContain(text.noResults);
  });

  it('passes a status filter to the server', async () => {
    const { service, setInput } = await render({ users: [] });

    await setInput('status', 'pending');

    expect(service.list).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: 'pending' }),
    );
  });

  it('ignores a hand-edited status that is not a real state', async () => {
    const { service, setInput } = await render({ users: [] });

    await setInput('status', 'nonsense');

    expect(service.list).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: undefined }),
    );
  });

  it('sorts by name in the browser, without re-fetching', async () => {
    const { names, service, setInput } = await render({
      users: [
        user({ id: 'a', lastName: 'Alpha', firstName: 'A' }),
        user({ id: 'z', lastName: 'Zeta', firstName: 'Z' }),
      ],
    });

    await setInput('sort', 'name');
    expect(names()).toEqual(['Alpha, A', 'Zeta, Z']);

    await setInput('sort', 'name_desc');
    expect(names()).toEqual(['Zeta, Z', 'Alpha, A']);

    // Sorting is client-side: the list was fetched once and never again.
    expect(service.list).toHaveBeenCalledTimes(1);
  });

  /*
   * What the list is opened for: a registration nobody has decided on, then the
   * accounts in use, then the ones that are over. Newest first inside each
   * group, so two registrations waiting since different days are not equally
   * old news.
   */
  it('defaults to the rows that need somebody, whatever order the server sent', async () => {
    const { names } = await render({
      users: [
        user({ id: 'off', lastName: 'Closed', status: 'disabled' }),
        user({ id: 'live', lastName: 'Active', status: 'active' }),
        user({ id: 'new', lastName: 'Waiting', status: 'pending' }),
      ],
    });

    expect(names()).toEqual(['Waiting, Jane', 'Active, Jane', 'Closed, Jane']);
  });

  it('breaks that tie by newest registration first', async () => {
    const { names } = await render({
      users: [
        user({
          id: 'old',
          lastName: 'Older',
          createdAt: '2026-01-01T00:00:00.000Z',
        }),
        user({
          id: 'new',
          lastName: 'Newer',
          createdAt: '2026-08-01T00:00:00.000Z',
        }),
      ],
    });

    expect(names()).toEqual(['Newer, Jane', 'Older, Jane']);
  });

  it('sorts by customer type, persons before companies', async () => {
    const { names, setInput } = await render({
      users: [
        user({ id: 'c', lastName: 'Corp', customerType: 'company' }),
        user({ id: 'p', lastName: 'Person', customerType: 'person' }),
      ],
    });

    await setInput('sort', 'type');
    expect(names()).toEqual(['Person, Jane', 'Corp, Jane']);
  });

  it('asks the server for the view this route is (customer vs staff)', async () => {
    const { service } = await render({ kind: 'staff', users: [] });

    expect(service.list).toHaveBeenLastCalledWith(
      expect.objectContaining({ kind: 'staff' }),
    );
  });

  it('shows company ID for customers and a role filter for staff', async () => {
    const customers = await render({ users: [user()] });
    // Company ID is a customer column — a filter, so its "all" option is what
    // names it. The role filter is not offered where every row is one role.
    expect(customers.el.textContent).toContain(text.companyIdFormatAll);
    expect(customers.el.textContent).not.toContain(text.roleAll);

    const staff = await render({
      kind: 'staff',
      users: [user({ role: 'manager', customerType: null, tierId: null })],
    });
    expect(staff.el.textContent).not.toContain(text.companyIdFormatAll);
    expect(staff.el.textContent).toContain(text.roleAll);
  });

  /**
   * The registration-number column becomes a filter exactly when there is
   * something to narrow to — which is the same rule the entry field uses for
   * its picker: one configured shape is no choice at all.
   */
  describe('the kind-of-number filter', () => {
    const twoFormats = {
      ...defaultDeploymentConfig,
      companyIdInput: {
        formats: [
          { key: 'sole', label: 'Sole trader', pattern: '^[0-9]{10}$' },
          { key: 'company', label: 'Company', pattern: '^[0-9]{12}$' },
        ],
      },
    };

    /**
     * Even one configured shape is worth a filter, because the option no format
     * describes is always there: the customers with no number at all.
     */
    it('offers "no company ID" alongside a single configured shape', async () => {
      const { el } = await render({ users: [user()] });

      expect(el.textContent).toContain(text.companyIdFormatAll);
      expect(el.textContent).toContain(text.companyIdFormatNone);
    });

    it('falls back to a plain heading with no formats configured', async () => {
      const { el } = await render({
        users: [user()],
        config: { ...defaultDeploymentConfig, companyIdInput: undefined },
      });

      expect(el.textContent).toContain(text.companyId);
      expect(el.textContent).not.toContain(text.companyIdFormatAll);
    });

    it('offers each configured shape by its own label', async () => {
      const { el } = await render({ users: [user()], config: twoFormats });

      expect(el.textContent).toContain(text.companyIdFormatAll);
      expect(el.textContent).toContain(text.companyIdFormatNone);
      expect(el.textContent).toContain('Sole trader');
      expect(el.textContent).toContain('Company');
    });

    // Server-side, like every other filter here: the URL is the state.
    it('asks the API for the chosen shape', async () => {
      const { service, setInput } = await render({
        users: [user()],
        config: twoFormats,
      });

      await setInput('companyIdFormat', 'company');

      expect(service.list).toHaveBeenLastCalledWith(
        expect.objectContaining({ companyIdFormat: 'company' }),
      );
    });

    // Otherwise an empty result reads as "this shop has no customers at all".
    it('counts as a filter, so an empty result says no matches', async () => {
      const { el, setInput } = await render({ users: [], config: twoFormats });
      expect(el.textContent).toContain(text.empty);

      await setInput('companyIdFormat', 'sole');

      expect(el.textContent).toContain(text.noResults);
      expect(el.textContent).not.toContain(text.empty);
    });
  });

  it('sends a pending row to the editor to be reviewed and approved', async () => {
    const { rowLink } = await render({
      users: [user({ id: 'p1', status: 'pending', tierId: null })],
    });

    // Approving is a decision made in the editor, where the details that
    // justify it are on screen — the row only points at it.
    const approve = rowLink(text.approve);
    expect(approve?.path).toBe('/admin/users/p1/edit');
    // …and carries the way back to this list, filters and all.
    expect(approve?.href).toContain('from=');
    expect(rowLink(text.edit)).toBeUndefined();
  });

  it('offers a plain edit once an account is past pending', async () => {
    const { rowLink } = await render({ users: [user({ id: 'u1' })] });

    expect(rowLink(text.edit)?.path).toBe('/admin/users/u1/edit');
    expect(rowLink(text.approve)).toBeUndefined();
  });

  it('leaves a closed account with no actions at all', async () => {
    const { el } = await render({
      users: [user({ id: 'x1', status: 'anonymized' })],
    });

    expect(el.querySelectorAll('tbody a')).toHaveLength(0);
    expect(el.querySelectorAll('tbody button')).toHaveLength(0);
  });

  it('declines a pending registration after a confirmation', async () => {
    const { service, confirm, rowAction } = await render({
      users: [user({ id: 'p1', status: 'pending' })],
    });

    await rowAction(text.decline);

    expect(confirm.ask).toHaveBeenCalled();
    expect(service.remove).toHaveBeenCalledWith('p1');
  });

  it('keeps the row when the decline confirmation is declined', async () => {
    const { service, rowAction } = await render({
      users: [user({ id: 'p1', status: 'pending' })],
      confirmed: false,
    });

    await rowAction(text.decline);

    expect(service.remove).not.toHaveBeenCalled();
  });

  it('reports a decline that raced with another change', async () => {
    const { el, service, rowAction } = await render({
      users: [user({ id: 'p1', status: 'pending' })],
    });
    service.remove.mockResolvedValueOnce({
      ok: false,
      code: 'account-not-purgeable',
    });

    await rowAction(text.decline);

    // No dialog is left to carry it, so the page says so itself.
    expect(el.querySelector('[role="alert"]')?.textContent).toContain(
      text.errors['account-not-purgeable'],
    );
  });

  it('points Add at the form for the view it is on', async () => {
    const addLink = (el: HTMLElement) =>
      (el.querySelector('a[href^="/admin/users"]') as HTMLAnchorElement)
        .getAttribute('href')
        ?.split('?')[0];

    const customers = await render({ users: [] });
    expect(addLink(customers.el)).toBe('/admin/users/new');

    const staff = await render({ kind: 'staff', users: [] });
    expect(addLink(staff.el)).toBe('/admin/users/staff/new');
  });

  it('names itself for the list it is, without offering the other one', async () => {
    // The two lists are reached from two admin-panel buttons, so a manager
    // never sees a control naming a list they may not open.
    const customers = await render({ users: [] });
    expect(customers.el.querySelector('h1')?.textContent).toContain(
      text.titleCustomers,
    );
    expect(customers.el.textContent).not.toContain(text.titleStaff);

    const staff = await render({ kind: 'staff', users: [] });
    expect(staff.el.querySelector('h1')?.textContent).toContain(
      text.titleStaff,
    );
  });

  it('deactivates an approved account, and switches a deactivated one back on', async () => {
    const off = await render({ users: [user({ id: 'u1', status: 'active' })] });
    await off.rowAction(text.deactivate);
    expect(off.confirm.ask).toHaveBeenCalled();
    expect(off.service.setActive).toHaveBeenCalledWith('u1', false);

    // Approved but never signed in: a colleague who left before opening the
    // mail still needs the account stopped.
    const invited = await render({
      users: [user({ id: 'u2', status: 'invited' })],
    });
    await invited.rowAction(text.deactivate);
    expect(invited.service.setActive).toHaveBeenCalledWith('u2', false);

    const on = await render({
      users: [user({ id: 'u1', status: 'disabled' })],
    });
    await on.rowAction(text.reactivate);
    expect(on.service.setActive).toHaveBeenCalledWith('u1', true);
  });

  it('offers neither switch on a registration or a closed account', async () => {
    const pending = await render({
      users: [user({ status: 'pending' })],
    });
    // Nobody has decided on it yet: the actions are approve and decline.
    expect(pending.el.textContent).not.toContain(text.deactivate);

    const closed = await render({ users: [user({ status: 'anonymized' })] });
    expect(closed.el.querySelectorAll('tbody button')).toHaveLength(0);
  });

  it('reports a refused deactivation', async () => {
    const { el, service, rowAction } = await render({
      users: [user({ id: 'a1', status: 'active' })],
    });
    service.setActive.mockResolvedValueOnce({ ok: false, code: 'last-admin' });

    await rowAction(text.deactivate);

    expect(el.querySelector('[role="alert"]')?.textContent).toContain(
      text.errors['last-admin'],
    );
  });
});
