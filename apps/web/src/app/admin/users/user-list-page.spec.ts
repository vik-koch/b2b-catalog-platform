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
  } = {},
) {
  const service = { list: vi.fn(async () => options.users ?? []) };
  const tiers = {
    list: vi.fn(async () => ({
      tiers: options.tiers ?? [],
      defaultUserCount: 0,
    })),
  };
  const auth = { user: () => ({ role: options.role ?? 'admin' }) };

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
      { provide: StaffUsersService, useValue: service },
      { provide: TiersService, useValue: tiers },
    ],
  });
  const fixture = TestBed.createComponent(UserListPage);
  if (options.kind) fixture.componentRef.setInput('kind', options.kind);
  await fixture.whenStable();
  fixture.detectChanges();

  const el = fixture.nativeElement as HTMLElement;
  const setInput = async (name: string, value: string) => {
    fixture.componentRef.setInput(name, value);
    await fixture.whenStable();
    fixture.detectChanges();
  };
  const names = () =>
    [...el.querySelectorAll('tbody tr')].map((row) =>
      row.querySelector('td')?.textContent?.trim(),
    );

  return { el, service, tiers, fixture, setInput, names };
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

  it('hides the Staff tab from a manager', async () => {
    const asManager = await render({ role: 'manager', users: [] });
    expect(asManager.el.textContent).not.toContain(text.tabStaff);

    const asAdmin = await render({ role: 'admin', users: [] });
    expect(asAdmin.el.textContent).toContain(text.tabStaff);
  });
});
