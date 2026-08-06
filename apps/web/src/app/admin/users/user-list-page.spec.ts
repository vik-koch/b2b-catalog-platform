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
      { provide: DEPLOYMENT_CONFIG, useValue: defaultDeploymentConfig },
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
  const names = () =>
    [...el.querySelectorAll('tbody tr')].map((row) =>
      row.querySelector('td')?.textContent?.trim(),
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

  it('defaults to newest registration first, whatever order the server sent', async () => {
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
    // Company ID is a customer column; the role filter (its "All roles" option
    // is visible text) is not offered where every row is one role.
    expect(customers.el.textContent).toContain(text.companyId);
    expect(customers.el.textContent).not.toContain(text.roleAll);

    const staff = await render({
      kind: 'staff',
      users: [user({ role: 'manager', customerType: null, tierId: null })],
    });
    expect(staff.el.textContent).not.toContain(text.companyId);
    expect(staff.el.textContent).toContain(text.roleAll);
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
      message: 'Only a pending registration can be deleted',
    });

    await rowAction(text.decline);

    // No dialog is left to carry it, so the page says so itself.
    expect(el.querySelector('[role="alert"]')?.textContent).toContain(
      'Only a pending registration',
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
    service.setActive.mockResolvedValueOnce({
      ok: false,
      message: 'This is the last admin account; promote another one first',
    });

    await rowAction(text.deactivate);

    expect(el.querySelector('[role="alert"]')?.textContent).toContain(
      'last admin',
    );
  });
});
