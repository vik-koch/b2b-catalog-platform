import { AdminOrderDetail } from '@b2b-catalog-platform/shared';

/**
 * One order request, in the shape staff read it (FR-UNIT-04). Deliberately not
 * the simplest one: two lines in different units, a line note carrying markup,
 * a company party and a tier, so anything rendering or notifying on an order
 * meets the awkward cases without inventing its own.
 */
const address = {
  street: 'Hafenstraße 12',
  street2: null,
  postalCode: '20359',
  city: 'Hamburg',
  region: null,
  country: 'DE' as const,
};

export const demoAdminOrder: AdminOrderDetail = {
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
