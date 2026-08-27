import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AdminOrderDetail } from '@b2b-catalog-platform/shared';
import { ADMIN_TEXT } from '../../config/admin-text';
import { defaultAdminText } from '../../config/admin-text.fixture';
import { APP_TEXT } from '../../config/app-text';
import { defaultAppText } from '../../config/app-text.fixture';
import { DEPLOYMENT_CONFIG } from '../../config/deployment-config';
import { defaultDeploymentConfig } from '../../config/deployment-config.fixture';
import { AdminOrderDetailPage } from './order-detail-page';
import { AdminOrdersService } from './orders.service';

const text = defaultAdminText.orderDetail;

const address = {
  street: 'Hafenstraße 12',
  street2: null,
  postalCode: '20359',
  city: 'Hamburg',
  region: null,
  country: 'DE' as const,
};

const placed: AdminOrderDetail = {
  reference: 'DEMO-260826-4831',
  status: 'requested',
  createdAt: '2026-08-26T09:15:00.000Z',
  statusChangedAt: '2026-08-26T09:15:00.000Z',
  totalMinor: 12990,
  currency: 'EUR',
  itemCount: 1,
  contact: {
    name: 'Alex Fischer',
    email: 'alex@example.com',
    phone: '+494012345678',
  },
  party: { name: 'Kontor GmbH', registrationId: 'DE123456789' },
  fulfilmentMethod: 'delivery',
  deliveryAddress: address,
  pickup: null,
  deliveryZone: null,
  billingAddress: address,
  paymentMethod: 'bank-transfer',
  preferredDate: null,
  customerNote: null,
  customerEmail: 'alex@example.com',
  tierKey: 'wholesale',
  lines: [
    {
      name: 'Espresso cups',
      slug: 'espresso-cups',
      linked: true,
      image: null,
      unit: 'box',
      quantity: 1,
      pieces: 100,
      // A box of a hundred, priced per ten.
      priceMinor: 1999,
      priceBasisPieces: 10,
      lineTotalMinor: 19990,
      note: null,
    },
  ],
  shipment: {
    cartons: 1,
    volume: null,
    weight: null,
    coveredLines: 1,
    uncoveredLines: 0,
    approximate: false,
  },
};

async function render(answer: AdminOrderDetail | null | 'reject') {
  const get = vi.fn(() =>
    answer === 'reject'
      ? Promise.reject(new Error('500'))
      : Promise.resolve(answer),
  );

  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [AdminOrderDetailPage],
    providers: [
      provideRouter([]),
      { provide: ADMIN_TEXT, useValue: defaultAdminText },
      { provide: APP_TEXT, useValue: defaultAppText },
      { provide: DEPLOYMENT_CONFIG, useValue: defaultDeploymentConfig },
      { provide: AdminOrdersService, useValue: { get } },
    ],
  });

  const fixture = TestBed.createComponent(AdminOrderDetailPage);
  fixture.componentRef.setInput('reference', placed.reference);
  await fixture.whenStable();
  fixture.detectChanges();
  return { fixture, el: fixture.nativeElement as HTMLElement, get };
}

describe('AdminOrderDetailPage (FR-AUTH-03)', () => {
  // FR-UNIT-04: the source system prices in basis units, so staff read the
  // line in them — not in the unit the customer bought through.
  it('reads a line in basis units', async () => {
    const { el } = await render(placed);

    expect(el.textContent).toContain('10 ×');
    expect(el.textContent).toMatch(/19[.,]99/);
  });

  it('shows what only staff see', async () => {
    const { el } = await render(placed);

    expect(el.textContent).toContain(text.customer);
    expect(el.textContent).toContain('alex@example.com');
    expect(el.textContent).toContain(text.tier);
    expect(el.textContent).toContain('wholesale');
  });

  // The default list has no key of its own, and a guest has no account: both
  // are facts about the order rather than blanks.
  it('names the default price list and a guest order', async () => {
    const { el } = await render({
      ...placed,
      tierKey: null,
      customerEmail: null,
    });

    expect(el.textContent).toContain(text.tierDefault);
    expect(el.textContent).toContain(defaultAdminText.orderList.guest);
  });

  it('reads the order back in the admin’s own words', async () => {
    const { el } = await render(placed);

    expect(el.textContent).toContain(text.items);
    expect(el.textContent).toContain(text.invoice);
    expect(el.textContent).toContain('Kontor GmbH · DE123456789');
    expect(el.textContent).toContain(text.billingSame);
    expect(el.textContent).toContain(text.transfer);
    expect(el.textContent).toContain(text.whenAny);
  });

  it('says an unknown reference opens nothing', async () => {
    const { el } = await render(null);

    expect(el.textContent).toContain(text.notFound);
  });

  it('says so when the order cannot be read', async () => {
    const { el } = await render('reject');

    expect(el.querySelector('[role="alert"]')?.textContent).toContain(
      text.loadError,
    );
  });
});
