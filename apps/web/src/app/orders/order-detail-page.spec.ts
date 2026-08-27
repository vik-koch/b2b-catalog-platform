import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { OrderDetail } from '@b2b-catalog-platform/shared';
import { APP_TEXT } from '../config/app-text';
import { defaultAppText } from '../config/app-text.fixture';
import { DEPLOYMENT_CONFIG } from '../config/deployment-config';
import { defaultDeploymentConfig } from '../config/deployment-config.fixture';
import { OrderDetailPage } from './order-detail-page';
import { OrdersService } from './orders.service';

const text = defaultAppText.auth.myAccount.orders;
const review = defaultAppText.checkout.review;

const address = {
  street: 'Hafenstraße 12',
  street2: null,
  postalCode: '20359',
  city: 'Hamburg',
  region: null,
  country: 'DE' as const,
};

const placed: OrderDetail = {
  reference: 'DEMO-260826-4831',
  status: 'requested',
  createdAt: '2026-08-26T09:15:00.000Z',
  totalMinor: 12990,
  currency: 'EUR',
  itemCount: 2,
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
  preferredDate: '2026-09-02',
  customerNote: 'Please call before you come.',
  lines: [
    {
      name: 'Espresso cups',
      slug: 'espresso-cups',
      linked: true,
      image: null,
      unit: 'pack',
      quantity: 2,
      pieces: 12,
      lineTotalMinor: 9990,
      note: '100 in red',
    },
    {
      name: 'Saucers (discontinued)',
      slug: 'saucers',
      linked: false,
      image: null,
      unit: 'piece',
      quantity: 3,
      pieces: 3,
      lineTotalMinor: 3000,
      note: null,
    },
  ],
  shipment: {
    cartons: 1,
    volume: '0.020',
    weight: '4.500',
    coveredLines: 2,
    uncoveredLines: 0,
    approximate: true,
  },
};

async function render(answer: OrderDetail | null | 'reject') {
  const getMine = vi.fn(() =>
    answer === 'reject'
      ? Promise.reject(new Error('500'))
      : Promise.resolve(answer),
  );

  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [OrderDetailPage],
    providers: [
      provideRouter([]),
      { provide: APP_TEXT, useValue: defaultAppText },
      { provide: DEPLOYMENT_CONFIG, useValue: defaultDeploymentConfig },
      { provide: OrdersService, useValue: { getMine } },
    ],
  });

  const fixture = TestBed.createComponent(OrderDetailPage);
  fixture.componentRef.setInput('reference', 'DEMO-260826-4831');
  await fixture.whenStable();
  fixture.detectChanges();
  return { fixture, el: fixture.nativeElement as HTMLElement, getMine };
}

describe('OrderDetailPage (FR-ACC-01)', () => {
  it('reads the order back under the headings checkout asked in', async () => {
    const { el } = await render(placed);

    expect(el.textContent).toContain(placed.reference);
    expect(el.textContent).toContain(text.statusRequested);
    expect(el.textContent).toContain(review.fulfilment);
    expect(el.textContent).toContain(review.invoice);
    // The party carries its registration number, and the invoice went to the
    // same place as the goods.
    expect(el.textContent).toContain('Kontor GmbH · DE123456789');
    expect(el.textContent).toContain(review.billingSame);
    expect(el.textContent).toContain(
      defaultAppText.checkout.payment.transferTitle,
    );
    // The contact block is this page's own: weeks later it says who to ring.
    expect(el.textContent).toContain(text.detail.contact);
    expect(el.textContent).toContain('alex@example.com');
    expect(el.textContent).toContain(placed.customerNote);
  });

  // The unit is a lens on a piece count (FR-UNIT-01), and both figures were
  // frozen with the order.
  it('states a non-piece line in its own unit and in pieces', async () => {
    const { el } = await render(placed);

    expect(el.textContent).toContain('2 pk (12 pcs)');
    expect(el.textContent).toContain('100 in red');
  });

  it('links a line only while its product can still be opened', async () => {
    const { el } = await render(placed);

    expect(el.querySelector('a[href="/product/espresso-cups"]')).not.toBeNull();
    expect(el.querySelector('a[href="/product/saucers"]')).toBeNull();
    expect(el.textContent).toContain('Saucers (discontinued)');
  });

  it('reads a pickup order back as a collection, with no delivery address', async () => {
    const { el } = await render({
      ...placed,
      fulfilmentMethod: 'pickup',
      deliveryAddress: null,
      pickup: { key: 'harbour', name: 'Harbour store', address: 'Quay 3' },
    });

    expect(el.textContent).toContain(
      defaultAppText.checkout.fulfilment.pickupTitle,
    );
    expect(el.textContent).toContain('Harbour store');
    expect(el.textContent).toContain(
      defaultAppText.checkout.timing.pickupLabel,
    );
    // Not "invoiced to the same address": there was no delivery address to
    // repeat, so the billing one is written out.
    expect(el.textContent).not.toContain(review.billingSame);
    expect(el.textContent).toContain('20359 Hamburg');
  });

  it('says when no date was asked for', async () => {
    const { el } = await render({ ...placed, preferredDate: null });

    expect(el.textContent).toContain(review.whenAny);
  });

  // Somebody else's reference and one that never existed look identical here,
  // which is the API's decision and this page keeps it.
  it('says an unknown order is not on the account', async () => {
    const { el } = await render(null);

    expect(el.textContent).toContain(text.detail.notFound);
    expect(el.textContent).not.toContain(text.statusRequested);
  });

  it('says so when the order cannot be read', async () => {
    const { el } = await render('reject');

    expect(el.querySelector('[role="alert"]')?.textContent).toContain(
      text.detail.error,
    );
  });
});
