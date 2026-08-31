import { ProductUnit } from '@b2b-catalog-platform/shared';

/**
 * Placed orders and saved addresses for the demo, so the order screens
 * (`/account/orders`, `/admin/orders`, the mailed `/orders/:token` summary) and
 * the account's address book have something in them on a fresh stack.
 *
 * The keys that read like config — the reference prefix, the pickup points, the
 * delivery zones — are the demo `config/deployment.json`'s own values, written
 * out here as the fixtures they are. An order snapshots all three anyway, so a
 * stack whose config has moved on shows exactly what a real old order would.
 */

/** Dates are absolute, not "n days ago": the reference carries the date it was
 * placed, and a relative one would mint a new reference — and so a duplicate
 * order — on every re-seed. */
export interface OrderSeed {
  /** `{prefix}-YYMMDD-NNNN`, matching `placedOn`. The identity a re-seed skips on. */
  reference: string;
  /** ISO date. Its `YYMMDD` is what `reference` carries. */
  placedOn: string;
  /** The account that placed it, by email, or null for a guest order. */
  email: string | null;
  status: 'requested' | 'approved' | 'declined' | 'cancelled';
  paymentMethod: 'cash' | 'bank-transfer' | 'card-later';
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  /** The invoiced party (FR-CART-09) — usually the account's own. */
  partyName: string;
  partyRegistrationId: string | null;
  billing: AddressSeed;
  /** A delivery address, or a pickup point's key. Exactly one. */
  delivery?: AddressSeed & { zoneKey: string; freeFromMinor: number };
  pickupKey?: string;
  preferredDate?: string;
  customerNote?: string;
  lines: OrderLineSeed[];
}

export interface AddressSeed {
  street: string;
  street2?: string;
  postalCode: string;
  city: string;
  country: string;
}

/** A line as it was bought: a piece count, and the unit it was read through. */
export interface OrderLineSeed {
  /** The product's `sourceId`. */
  sourceId: string;
  unit: ProductUnit;
  pieces: number;
  note?: string;
}

/** The pickup points, by key, as `config/deployment.json` names them. */
export const pickupSnapshots: Record<
  string,
  { name: string; address: string }
> = {
  speicherstadt: {
    name: 'Speicherstadt Office',
    address: 'Am Sandtorkai 30, 20457 Hamburg',
  },
  altona: {
    name: 'Altona Warehouse',
    address: 'Ottenser Hauptstraße 10, 22765 Hamburg',
  },
};

const hamburg = (
  street: string,
  postalCode: string,
): AddressSeed & { zoneKey: string; freeFromMinor: number } => ({
  street,
  postalCode,
  city: 'Hamburg',
  country: 'DE',
  zoneKey: 'city',
  freeFromMinor: 15000,
});

/**
 * Saved addresses (FR-CART-07), by account email. Two rows for one customer and
 * one for the rest: the picker is only worth looking at where there is a choice,
 * and an unlabelled row is worth seeing too — it is headed by its street line.
 */
export const addressSeeds: Record<
  string,
  (AddressSeed & { label?: string })[]
> = {
  'einkauf@cafe-nordlicht.example': [
    {
      label: 'Café',
      street: 'Osterstraße 114',
      postalCode: '20255',
      city: 'Hamburg',
      country: 'DE',
    },
    {
      label: 'Warehouse',
      street: 'Billstraße 82',
      street2: 'Gate 3',
      postalCode: '20539',
      city: 'Hamburg',
      country: 'DE',
    },
  ],
  'office@hafenkantine.example': [
    {
      street: 'Große Elbstraße 27',
      postalCode: '22767',
      city: 'Hamburg',
      country: 'DE',
    },
  ],
  'anna.behrens@mail.example': [
    {
      label: 'Home',
      street: 'Holstenstraße 9',
      postalCode: '22767',
      city: 'Hamburg',
      country: 'DE',
    },
  ],
  'r.steinberg@mail.example': [
    {
      label: 'Home',
      street: 'Sierichstraße 44',
      postalCode: '22301',
      city: 'Hamburg',
      country: 'DE',
    },
  ],
};

/**
 * The orders themselves. Written one per case rather than generated, so the
 * staff list shows the shapes a manager actually has to read: both fulfilments,
 * all three payment methods, a guest with no account behind it, a third-party
 * invoice, a line carrying a variant note, and a status that is not `requested`.
 */
export const orderSeeds: OrderSeed[] = [
  {
    reference: 'CK-260811-4207',
    placedOn: '2026-08-11',
    email: 'einkauf@cafe-nordlicht.example',
    status: 'approved',
    paymentMethod: 'bank-transfer',
    contactName: 'Lena Brinkmann',
    contactEmail: 'einkauf@cafe-nordlicht.example',
    contactPhone: '+494012010001',
    partyName: 'Café Nordlicht GmbH',
    partyRegistrationId: 'DE811234501',
    billing: {
      street: 'Osterstraße 114',
      postalCode: '20255',
      city: 'Hamburg',
      country: 'DE',
    },
    delivery: hamburg('Billstraße 82', '20539'),
    customerNote:
      'Please ring at the side entrance, the shop is closed until 9.',
    lines: [
      { sourceId: 'ESP-001', unit: 'box', pieces: 48 },
      { sourceId: 'ESP-004', unit: 'pack', pieces: 12 },
      { sourceId: 'GRD-001', unit: 'piece', pieces: 1 },
    ],
  },
  {
    reference: 'CK-260817-1183',
    placedOn: '2026-08-17',
    email: 'office@hafenkantine.example',
    status: 'requested',
    // A company, so never cash (FR-CART-04).
    paymentMethod: 'card-later',
    contactName: 'Marlene Suhr',
    contactEmail: 'office@hafenkantine.example',
    contactPhone: '+494012010003',
    partyName: 'Hafenkantine Betriebs GmbH',
    partyRegistrationId: 'DE811234503',
    billing: {
      street: 'Große Elbstraße 27',
      postalCode: '22767',
      city: 'Hamburg',
      country: 'DE',
    },
    pickupKey: 'speicherstadt',
    preferredDate: '2026-08-21',
    lines: [
      { sourceId: 'ESP-002', unit: 'pack', pieces: 18 },
      {
        sourceId: 'CUP-001',
        unit: 'piece',
        pieces: 4,
        note: 'Two sand, two slate please.',
      },
    ],
  },
  {
    reference: 'CK-260820-6640',
    placedOn: '2026-08-20',
    email: 'anna.behrens@mail.example',
    status: 'requested',
    paymentMethod: 'card-later',
    contactName: 'Anna Behrens',
    contactEmail: 'anna.behrens@mail.example',
    contactPhone: '+494012010013',
    partyName: 'Anna Behrens',
    partyRegistrationId: null,
    billing: {
      street: 'Holstenstraße 9',
      postalCode: '22767',
      city: 'Hamburg',
      country: 'DE',
    },
    delivery: hamburg('Holstenstraße 9', '22767'),
    lines: [
      { sourceId: 'ESP-003', unit: 'piece', pieces: 6 },
      { sourceId: 'CUP-002', unit: 'piece', pieces: 2 },
    ],
  },
  {
    // No account behind it: the order a mailed link is the only way back into.
    reference: 'CK-260823-9014',
    placedOn: '2026-08-23',
    email: null,
    status: 'cancelled',
    paymentMethod: 'cash',
    contactName: 'Timo Reinders',
    contactEmail: 't.reinders@mail.example',
    contactPhone: '+494012019001',
    partyName: 'Timo Reinders',
    partyRegistrationId: null,
    billing: {
      street: 'Wandsbeker Chaussee 12',
      postalCode: '22089',
      city: 'Hamburg',
      country: 'DE',
    },
    delivery: {
      street: 'Holtenauer Straße 88',
      postalCode: '24105',
      city: 'Kiel',
      country: 'DE',
      zoneKey: 'north',
      freeFromMinor: 40000,
    },
    customerNote: 'Ordered by mistake, sorry — placed the same thing twice.',
    lines: [{ sourceId: 'ESP-005', unit: 'pack', pieces: 24 }],
  },
  {
    // Bought by a private customer, invoiced to a company that is not hers:
    // priced provisionally, because her price group is not that company's.
    reference: 'CK-260826-3352',
    placedOn: '2026-08-26',
    email: 'r.steinberg@mail.example',
    status: 'requested',
    paymentMethod: 'bank-transfer',
    contactName: 'Rita Steinberg',
    contactEmail: 'r.steinberg@mail.example',
    contactPhone: '+494012010019',
    partyName: 'Steinberg Veranstaltungen GbR',
    partyRegistrationId: 'DE811234599',
    billing: {
      street: 'Sierichstraße 44',
      postalCode: '22301',
      city: 'Hamburg',
      country: 'DE',
    },
    pickupKey: 'altona',
    lines: [
      { sourceId: 'ESP-006', unit: 'box', pieces: 24 },
      { sourceId: 'ESP-007', unit: 'pack', pieces: 6 },
    ],
  },
];
