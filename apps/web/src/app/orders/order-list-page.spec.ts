import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import {
  fillText,
  OrderSummary,
  Pagination,
} from '@b2b-catalog-platform/shared';
import { APP_TEXT } from '../config/app-text';
import { defaultAppText } from '../config/app-text.fixture';
import { DEPLOYMENT_CONFIG } from '../config/deployment-config';
import { defaultDeploymentConfig } from '../config/deployment-config.fixture';
import { OrderListPage } from './order-list-page';
import { OrdersService } from './orders.service';

const text = defaultAppText.orders;

const placed: OrderSummary = {
  reference: 'DEMO-260826-4831',
  status: 'requested',
  paymentState: 'not-due',
  fulfilmentMethod: 'delivery',
  createdAt: '2026-08-26T09:15:00.000Z',
  totalMinor: 12990,
  currency: 'EUR',
  itemCount: 3,
};

function page(overrides: Partial<Pagination> = {}): Pagination {
  return { page: 1, pageSize: 20, total: 1, totalPages: 1, ...overrides };
}

async function render(
  answer: { items: OrderSummary[]; pagination: Pagination } | 'reject',
  queryPage = '1',
  /** The `state` query param, as the router delivers it — absent arrives as
   * undefined, never as a default. */
  state: string | undefined = undefined,
) {
  const listMine = vi.fn(() =>
    answer === 'reject'
      ? Promise.reject(new Error('500'))
      : Promise.resolve(answer),
  );

  // Reset first: two of these cases render twice, and a second
  // configureTestingModule on an instantiated TestBed throws.
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [OrderListPage],
    providers: [
      provideRouter([]),
      { provide: APP_TEXT, useValue: defaultAppText },
      { provide: DEPLOYMENT_CONFIG, useValue: defaultDeploymentConfig },
      { provide: OrdersService, useValue: { listMine } },
    ],
  });

  const fixture = TestBed.createComponent(OrderListPage);
  fixture.componentRef.setInput('page', queryPage);
  fixture.componentRef.setInput('state', state);
  await fixture.whenStable();
  fixture.detectChanges();
  return { fixture, el: fixture.nativeElement as HTMLElement, listMine };
}

describe('OrderListPage (FR-ACC-01)', () => {
  it('lists an order with what it came to and where it stands', async () => {
    const { el } = await render({ items: [placed], pagination: page() });

    expect(el.textContent).toContain(placed.reference);
    expect(el.textContent).toContain(
      fillText(text.itemCount, { count: placed.itemCount }),
    );
    // The status is the shop's answer, in the customer's words rather than the
    // column's value.
    expect(el.textContent).toContain(text.statusRequested);
    expect(el.textContent).not.toContain(placed.status);
    // Formatted from the deployment's own currency, minor units and all.
    expect(el.textContent).toMatch(/129[.,]90/);
    // The row opens the order, addressed by the reference the customer was
    // quoted rather than by any id.
    expect(
      el.querySelector(`a[href="/account/orders/${placed.reference}"]`),
    ).not.toBeNull();
  });

  it('offers the catalogue when nothing has been ordered yet', async () => {
    const { el } = await render({ items: [], pagination: page({ total: 0 }) });

    expect(el.textContent).toContain(text.empty);
    expect(el.querySelector('a[href="/catalog"]')).not.toBeNull();
  });

  // A hand-edited page falls back to the first one rather than becoming a
  // request the API would refuse.
  it('reads the page from the query parameter, and floors a nonsense one', async () => {
    const { listMine } = await render(
      { items: [placed], pagination: page({ page: 2, totalPages: 2 }) },
      '2',
    );
    expect(listMine).toHaveBeenCalledWith(2, undefined);

    const bad = await render({ items: [], pagination: page() }, 'nonsense');
    expect(bad.listMine).toHaveBeenCalledWith(1, undefined);
  });

  /**
   * What the marker on the account page links to (FR-WORK-03). The chip is
   * the only thing on this page that says the list is narrowed — there is no
   * dropdown, because nothing here offers to filter — and dismissing it is a
   * link back to the whole history rather than a control with state.
   */
  it('narrows to what waits on the account holder, and says so as a chip', async () => {
    const { el, listMine } = await render(
      { items: [placed], pagination: page() },
      '1',
      'to-pay',
    );

    expect(listMine).toHaveBeenCalledWith(1, 'to-pay');
    expect(el.textContent).toContain(text.filterToPay);
    expect(el.querySelector('a[href="/account/orders"]')).not.toBeNull();
  });

  // A value nothing on this page can produce is a stale or hand-typed link,
  // and the honest answer to one is the whole history.
  it('ignores a filter the URL invented', async () => {
    const { el, listMine } = await render(
      { items: [placed], pagination: page() },
      '1',
      'to-be-admired',
    );

    expect(listMine).toHaveBeenCalledWith(1, undefined);
    expect(el.textContent).not.toContain(text.filterToPay);
  });

  it('pages only when there is more than one page', async () => {
    const one = await render({ items: [placed], pagination: page() });
    expect(one.el.textContent).not.toContain(defaultAppText.catalog.nextPage);

    const two = await render({
      items: [placed],
      pagination: page({ total: 25, totalPages: 2 }),
    });
    expect(two.el.textContent).toContain(defaultAppText.catalog.nextPage);
    expect(two.el.textContent).toContain(
      defaultAppText.catalog.pageStatus
        .replace('{page}', '1')
        .replace('{total}', '2'),
    );
  });

  it('says so when the history cannot be read', async () => {
    const { el } = await render('reject');

    expect(el.querySelector('[role="alert"]')?.textContent).toContain(
      text.error,
    );
  });
});
