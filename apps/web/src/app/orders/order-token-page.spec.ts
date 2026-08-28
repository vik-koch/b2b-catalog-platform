import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { OrderDetail } from '@b2b-catalog-platform/shared';
import { signal } from '@angular/core';
import { AuthService } from '../auth/auth.service';
import { APP_TEXT } from '../config/app-text';
import { defaultAppText } from '../config/app-text.fixture';
import { DEPLOYMENT_CONFIG } from '../config/deployment-config';
import { defaultDeploymentConfig } from '../config/deployment-config.fixture';
import { OrderTokenPage } from './order-token-page';
import { OrdersService } from './orders.service';

const text = defaultAppText.orders.public;

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
  itemCount: 1,
  contact: {
    name: 'Alex Fischer',
    email: 'alex@example.com',
    phone: '+494012345678',
  },
  party: { name: 'Alex Fischer', registrationId: null },
  fulfilmentMethod: 'delivery',
  deliveryAddress: address,
  pickup: null,
  deliveryZone: null,
  billingAddress: address,
  paymentMethod: 'cash',
  preferredDate: null,
  customerNote: null,
  lines: [
    {
      name: 'Espresso cups',
      slug: 'espresso-cups',
      linked: true,
      image: null,
      unit: 'pack',
      quantity: 2,
      pieces: 12,
      lineTotalMinor: 12990,
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

async function render(
  answer: OrderDetail | null | 'reject',
  hintedRole: string | null = null,
) {
  const getByToken = vi.fn(() =>
    answer === 'reject'
      ? Promise.reject(new Error('500'))
      : Promise.resolve(answer),
  );

  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [OrderTokenPage],
    providers: [
      provideRouter([]),
      { provide: APP_TEXT, useValue: defaultAppText },
      { provide: DEPLOYMENT_CONFIG, useValue: defaultDeploymentConfig },
      { provide: OrdersService, useValue: { getByToken } },
      {
        provide: AuthService,
        useValue: { hintedRole: signal(hintedRole), user: signal(null) },
      },
    ],
  });

  const fixture = TestBed.createComponent(OrderTokenPage);
  fixture.componentRef.setInput('token', 'tok-123');
  await fixture.whenStable();
  fixture.detectChanges();
  return { fixture, el: fixture.nativeElement as HTMLElement, getByToken };
}

describe('OrderTokenPage (FR-NOTIF-06)', () => {
  it('opens the order the token names, without a session', async () => {
    const { el, getByToken } = await render(placed);

    expect(getByToken).toHaveBeenCalledWith('tok-123');
    expect(el.textContent).toContain(placed.reference);
    expect(el.textContent).toContain(defaultAppText.orders.statusRequested);
    expect(el.textContent).toContain('2 pk (12 pcs)');
    expect(el.textContent).toContain(defaultAppText.checkout.review.invoice);
  });

  // Approval takes days, so the account is offered here rather than between a
  // guest and the order they are trying to send.
  it('offers an account once the order is already sent', async () => {
    const { el } = await render(placed);

    expect(el.textContent).toContain(text.register);
    expect(el.querySelector('a[href="/register"]')).not.toBeNull();
  });

  // The link is reachable by anyone holding it, a customer with an account
  // included — and telling them to ask for one they already have is nonsense.
  it('makes no account offer to a reader who has one', async () => {
    const { el } = await render(placed, 'user');

    expect(el.textContent).not.toContain(text.register);
    expect(el.querySelector('a[href="/register"]')).toBeNull();
    // Still their order, still readable: the token is the credential here, and
    // whoever holds the link may not be the customer whose order it is.
    expect(el.textContent).toContain(placed.reference);
  });

  // The URL is the whole credential (ADR 0038), so it must not travel in a
  // `Referer` header to whatever the reader clicks next.
  it('keeps the page out of the index and out of referrers', async () => {
    await render(placed);

    expect(
      document.querySelector('meta[name="robots"]')?.getAttribute('content'),
    ).toBe('noindex');
    expect(
      document.querySelector('meta[name="referrer"]')?.getAttribute('content'),
    ).toBe('no-referrer');
  });

  it('says a token that opens nothing opens nothing', async () => {
    const { el } = await render(null);

    expect(el.textContent).toContain(text.notFound);
    expect(el.querySelector('a[href="/"]')).not.toBeNull();
  });

  it('says so when the order cannot be read', async () => {
    const { el } = await render('reject');

    expect(el.querySelector('[role="alert"]')?.textContent).toContain(
      defaultAppText.orders.error,
    );
  });
});
