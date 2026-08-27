import { AdminOrderDetail, MoneyFormat } from '@b2b-catalog-platform/shared';
import { demoMailText } from '../mail-text.fixture';
import { newOrderMail } from './new-order.template';
import { orderReceivedMail } from './order-received.template';

const currency: MoneyFormat = { code: 'EUR', locale: 'de-DE' };

const address = {
  street: 'Hafenstraße 12',
  street2: null,
  postalCode: '20359',
  city: 'Hamburg',
  region: null,
  country: 'DE' as const,
};

const order: AdminOrderDetail = {
  reference: 'CK-260826-4831',
  status: 'requested',
  createdAt: '2026-08-26T09:15:00.000Z',
  statusChangedAt: '2026-08-26T09:15:00.000Z',
  totalMinor: 12990,
  currency: 'EUR',
  itemCount: 2,
  contact: {
    name: 'Alex Fischer',
    email: 'alex@example.com',
    phone: '+49 40 1234567',
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
      unit: 'pack',
      quantity: 2,
      pieces: 12,
      priceMinor: 1999,
      priceBasisPieces: 10,
      lineTotalMinor: 9990,
      note: '100 in <red>',
    },
    {
      name: 'Saucers',
      slug: 'saucers',
      linked: true,
      image: null,
      unit: 'piece',
      quantity: 3,
      pieces: 3,
      priceMinor: 1000,
      priceBasisPieces: 1,
      lineTotalMinor: 3000,
      note: null,
    },
  ],
  shipment: {
    cartons: 1,
    volume: null,
    weight: null,
    coveredLines: 2,
    uncoveredLines: 0,
    approximate: false,
  },
};

describe('orderReceivedMail', () => {
  const t = demoMailText.orderReceived;
  // A guest's: they have no account to read the order from.
  const mail = orderReceivedMail(order, 'tok-123', currency, demoMailText);

  // The reference is what a customer quotes on the phone, so it is in the
  // subject rather than only in the body.
  it('names the order in the subject and repeats it in the body', () => {
    expect(mail.subject).toContain(order.reference);
    expect(mail.paragraphs?.[0]).toContain(order.reference);
    expect(mail.paragraphs?.[0]).not.toContain('{reference}');
  });

  // FR-NOTIF-06: for a guest this link is the only record of what they sent.
  it('links a guest to the summary the token opens', () => {
    expect(mail.action).toEqual({ label: t.action, path: '/orders/tok-123' });
  });

  // An account holder can already open the order signed in, so no capability
  // URL is mailed for it — and the token page is written for a stranger.
  it('links an account holder to their own order page instead', () => {
    const mine = orderReceivedMail(order, null, currency, demoMailText);

    expect(mine.action).toEqual({
      label: t.action,
      path: `/account/orders/${order.reference}`,
    });
    expect(JSON.stringify(mine)).not.toContain('tok-123');
  });

  it('states the lines, the total and nothing staff-only', () => {
    expect(mail.items?.[0]).toEqual({
      // A unit is a lens on a piece count, so anything but the piece says both.
      quantity: '2 pk (12 pcs)',
      name: 'Espresso cups',
      note: '100 in <red>',
      total: expect.stringContaining('99,90'),
    });
    expect(mail.items?.[1].quantity).toBe('3 pcs');
    expect(mail.rows).toContainEqual({
      label: t.totalLabel,
      value: expect.stringContaining('129,90'),
    });
    // The price list and the account behind the order are staff's to know.
    expect(JSON.stringify(mail)).not.toContain('wholesale');
  });
});

describe('newOrderMail', () => {
  const t = demoMailText.newOrder;
  const mail = newOrderMail(order, currency, demoMailText);

  // What a manager decides on before opening anything, read on a phone.
  it('carries who it is for, who to ring and what it comes to', () => {
    expect(mail.rows).toContainEqual({
      label: t.customerLabel,
      value: 'alex@example.com',
    });
    expect(mail.rows).toContainEqual({
      label: t.contactLabel,
      value: 'Alex Fischer · +49 40 1234567 · alex@example.com',
    });
    expect(mail.rows).toContainEqual({
      label: t.partyLabel,
      value: 'Kontor GmbH · DE123456789',
    });
    expect(mail.rows).toContainEqual({
      label: t.paymentLabel,
      value: t.transfer,
    });
  });

  it('opens the order in the admin panel, by its reference', () => {
    expect(mail.action).toEqual({
      label: t.action,
      path: `/admin/orders/${order.reference}`,
    });
  });

  // A guest order says so: "no account" is a fact about the order, and it
  // decides how the price was quoted.
  it('names a guest order as one', () => {
    const guest = newOrderMail(
      { ...order, customerEmail: null },
      currency,
      demoMailText,
    );

    expect(guest.rows).toContainEqual({
      label: t.customerLabel,
      value: t.guest,
    });
  });

  it('names the collection point for a pickup', () => {
    const pickup = newOrderMail(
      {
        ...order,
        fulfilmentMethod: 'pickup',
        deliveryAddress: null,
        pickup: { key: 'harbour', name: 'Harbour store', address: 'Quay 3' },
      },
      currency,
      demoMailText,
    );

    expect(pickup.rows).toContainEqual({
      label: t.fulfilmentLabel,
      value: `${t.pickup} · Harbour store`,
    });
  });
});
