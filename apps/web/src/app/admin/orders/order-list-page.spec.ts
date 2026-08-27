import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Pagination } from '@b2b-catalog-platform/shared';
import { ADMIN_TEXT } from '../../config/admin-text';
import { defaultAdminText } from '../../config/admin-text.fixture';
import { APP_TEXT } from '../../config/app-text';
import { defaultAppText } from '../../config/app-text.fixture';
import { DEPLOYMENT_CONFIG } from '../../config/deployment-config';
import { defaultDeploymentConfig } from '../../config/deployment-config.fixture';
import { AdminOrderListPage } from './order-list-page';
import { AdminOrdersService, StaffOrderSummary } from './orders.service';

const text = defaultAdminText.orderList;

const placed: StaffOrderSummary = {
  reference: 'DEMO-260826-4831',
  status: 'requested',
  createdAt: '2026-08-26T09:15:00.000Z',
  totalMinor: 12990,
  currency: 'EUR',
  itemCount: 3,
  customerEmail: 'alex@example.com',
  contactName: 'Alex Fischer',
};

function page(overrides: Partial<Pagination> = {}): Pagination {
  return { page: 1, pageSize: 20, total: 1, totalPages: 1, ...overrides };
}

async function render(
  items: StaffOrderSummary[] | 'reject',
  query: { page?: string; status?: string } = {},
) {
  const list = vi.fn(() =>
    items === 'reject'
      ? Promise.reject(new Error('500'))
      : Promise.resolve({
          items,
          pagination: page({ total: items.length }),
        }),
  );

  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [AdminOrderListPage],
    providers: [
      provideRouter([]),
      { provide: ADMIN_TEXT, useValue: defaultAdminText },
      { provide: APP_TEXT, useValue: defaultAppText },
      { provide: DEPLOYMENT_CONFIG, useValue: defaultDeploymentConfig },
      { provide: AdminOrdersService, useValue: { list } },
    ],
  });

  const fixture = TestBed.createComponent(AdminOrderListPage);
  fixture.componentRef.setInput('page', query.page ?? '1');
  fixture.componentRef.setInput('status', query.status ?? '');
  await fixture.whenStable();
  fixture.detectChanges();
  return { fixture, el: fixture.nativeElement as HTMLElement, list };
}

describe('AdminOrderListPage (FR-AUTH-03)', () => {
  it('lists an order with who to call and the account it came from', async () => {
    const { el } = await render([placed]);

    expect(el.textContent).toContain(placed.reference);
    expect(el.textContent).toContain('Alex Fischer');
    expect(el.textContent).toContain('alex@example.com');
    expect(el.textContent).toContain(text.statusRequested);
    expect(
      el.querySelector(`a[href="/admin/orders/${placed.reference}"]`),
    ).not.toBeNull();
  });

  // A guest order has no account behind it, which is a fact about the order
  // rather than a missing value.
  it('names a guest order as one', async () => {
    const { el } = await render([{ ...placed, customerEmail: null }]);

    expect(el.textContent).toContain(text.guest);
  });

  it('passes the status filter to the API, and drops a nonsense one', async () => {
    const filtered = await render([placed], { status: 'approved' });
    expect(filtered.list).toHaveBeenCalledWith({
      page: 1,
      status: 'approved',
    });

    const nonsense = await render([placed], { status: 'unfiled' });
    expect(nonsense.list).toHaveBeenCalledWith({ page: 1, status: undefined });
  });

  // Two different nothings: no orders at all, or none with this status.
  it('tells an empty list from an empty filter', async () => {
    const empty = await render([]);
    expect(empty.el.textContent).toContain(text.empty);

    const none = await render([], { status: 'declined' });
    expect(none.el.textContent).toContain(text.noResults);
  });

  it('says so when the list cannot be read', async () => {
    const { el } = await render('reject');

    expect(el.querySelector('[role="alert"]')?.textContent).toContain(
      text.loadError,
    );
  });
});
