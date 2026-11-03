import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { OrderSummary } from '@b2b-catalog-platform/shared/core/ordering';
import { STOREFRONT_TEXT } from '../../../shared/config/storefront-text';
import { defaultStorefrontText } from '../../../shared/config/storefront-text.fixture';
import { SHARED_TEXT } from '../../../shared/config/shared-text';
import { defaultSharedText } from '../../../shared/config/shared-text.fixture';
import { DEPLOYMENT_CONFIG } from '../../../shared/config/deployment-config';
import { defaultDeploymentConfig } from '../../../shared/config/deployment-config.fixture';
import { WorkService } from '../../../shared/work/work.service';
import { workStub } from '../../../shared/work/work.fixture';
import { OrdersService } from './orders.service';
import { RecentOrders } from './recent-orders';

/** One of the account's orders, as the list endpoint summarizes it. */
function order(reference: string): OrderSummary {
  return {
    reference,
    status: 'requested',
    paymentState: 'not-due',
    fulfilmentMethod: 'delivery',
    createdAt: '2026-03-02T10:00:00.000Z',
    itemCount: 3,
    totalMinor: 12500,
    currency: 'EUR',
  };
}

async function render(
  orders: OrderSummary[] | 'reject',
  waiting: { myPayments?: number; myPickups?: number } = {},
) {
  TestBed.configureTestingModule({
    imports: [RecentOrders],
    providers: [
      provideRouter([]),
      { provide: STOREFRONT_TEXT, useValue: defaultStorefrontText },
      { provide: SHARED_TEXT, useValue: defaultSharedText },
      { provide: DEPLOYMENT_CONFIG, useValue: defaultDeploymentConfig },
      { provide: WorkService, useValue: workStub(waiting) },
      {
        provide: OrdersService,
        useValue: {
          listMine: vi.fn(() =>
            orders === 'reject'
              ? Promise.reject(new Error('500'))
              : Promise.resolve({
                  items: orders,
                  pagination: {
                    page: 1,
                    pageSize: 10,
                    total: orders.length,
                    totalPages: 1,
                  },
                }),
          ),
        },
      },
    ],
  });

  const fixture = TestBed.createComponent(RecentOrders);
  await fixture.whenStable();
  fixture.detectChanges();
  return { fixture, el: fixture.nativeElement as HTMLElement };
}

describe('RecentOrders', () => {
  it('lists the newest orders and links each of them', async () => {
    const { el } = await render([order('CK-2026-0002'), order('CK-2026-0001')]);

    expect(el.textContent).toContain('CK-2026-0002');
    expect(
      el.querySelector('a[href="/account/orders/CK-2026-0002"]'),
    ).not.toBeNull();
  });

  // Five on the card; the sixth is what the history page is for.
  it('shows at most five, and offers the rest only when there are more', async () => {
    const many = Array.from({ length: 6 }, (_, i) =>
      order(`CK-2026-000${i + 1}`),
    );
    const { el } = await render(many);

    expect(el.querySelectorAll('a[href^="/account/orders/"]')).toHaveLength(5);
    expect(el.querySelector('a[href="/account/orders"]')).not.toBeNull();
  });

  // A button that opens the same five rows on another page is a click that
  // changes nothing.
  it('offers no history page when the card is already the whole of it', async () => {
    const { el } = await render([order('CK-2026-0001')]);

    expect(el.querySelector('a[href="/account/orders"]')).toBeNull();
  });

  it('says there are none yet, and where to start', async () => {
    const { el } = await render([]);

    expect(el.textContent).toContain(defaultStorefrontText.orders.empty);
    expect(el.querySelector('a[href="/catalog"]')).not.toBeNull();
  });

  it('reports orders it could not load', async () => {
    const { el } = await render('reject');

    expect(el.textContent).toContain(defaultStorefrontText.orders.error);
  });

  /*
   * What waits on the customer (FR-WORK-03), above the rows it is about —
   * the other end of the marker on the account control. Two queues rather
   * than one figure: each note links to the history narrowed to exactly the
   * orders it counted, so a customer who came to pay lands on what is owed
   * and not on their whole history.
   */
  it('says what is waiting on the account holder, and links to it', async () => {
    const { el } = await render([order('CK-2026-0001')], {
      myPayments: 2,
      myPickups: 1,
    });

    const notes = [...el.querySelectorAll('a[uiActionLink]')];
    expect(notes[0].textContent).toContain('2 waiting to be paid');
    expect(notes[0].getAttribute('href')).toBe('/account/orders?state=to-pay');
    expect(notes[1].textContent).toContain('1 ready to collect');
    expect(notes[1].getAttribute('href')).toBe(
      '/account/orders?state=to-collect',
    );
  });

  /** Each stands on its own: a customer with money owed and nothing to
   * collect is told about the money and nothing else. */
  it('draws only the queue that has something in it', async () => {
    const { el } = await render([order('CK-2026-0001')], {
      myPickups: 1,
    });

    const notes = [...el.querySelectorAll('a[uiActionLink]')];
    expect(notes).toHaveLength(1);
    expect(notes[0].textContent).toContain('1 ready to collect');
  });

  it('says nothing when nothing waits on them', async () => {
    const { el } = await render([order('CK-2026-0001')]);

    expect(el.querySelector('a[uiActionLink]')).toBeNull();
  });
});
