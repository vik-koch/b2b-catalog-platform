import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import {
  deliveryConfigSchema,
  OrderSubmission,
} from '@b2b-catalog-platform/shared';
import { AddressesService } from '../addresses/addresses.service';
import { PickupLocation } from '../config/deployment-config';
import * as schema from '../db/schema';
import { orderItems, orders, users } from '../db/schema';
import { OrderNotifications } from './order-notifications';
import * as reference from './order-reference';
import { CartChangedException, OrdersService } from './orders.service';

/**
 * Submission, without a database. What is worth pinning here is everything that
 * happens between pricing the cart and writing it: which refusals come out,
 * where the delivery zone is decided, and that a collided reference is retried
 * with a *new* one rather than the same one.
 */

/** €19.99 per ten pieces, ten to a pack — the product the cart is priced from. */
const product = {
  id: 'product-1',
  slug: 'hafen-espresso',
  name: 'Hafen Espresso',
  sourceId: 'ERP-1',
  priceMinor: 1999,
  images: [],
  boxVolume: null,
  boxWeight: null,
  boxCount: 1,
  lineNoteEnabled: false,
  priceBasisPieces: 10,
  piecesPerPack: 10,
  packsPerBox: 4,
  minPieceQty: 10,
};

/** The account columns the party resolver reads. */
interface AccountRow {
  firstName: string | null;
  lastName: string | null;
  email: string;
  customerType: 'person' | 'company' | null;
  companyName: string | null;
  companyRegistrationId: string | null;
}

interface Insert {
  table: unknown;
  values: Record<string, unknown> | Record<string, unknown>[];
}

/**
 * A drizzle stand-in: one select for the pricer, and a transaction whose first
 * `collisions` order inserts raise Postgres' unique-violation code.
 */
function testDb(collisions = 0, accountRow: Partial<AccountRow> = {}) {
  const inserts: Insert[] = [];
  /** Every reference the service tried, collisions included. */
  const attempted: string[] = [];
  let remaining = collisions;
  const select = {
    from: (table: unknown) => (table === users ? account : select),
    where: () => Promise.resolve([product]),
  };
  /** The party an account is registered as, for a submission that names none. */
  const account = {
    from: () => account,
    where: () => account,
    limit: () =>
      Promise.resolve([
        {
          firstName: 'Ada',
          lastName: 'Byron',
          email: 'ada@example.com',
          customerType: 'company',
          companyName: 'Kontor GmbH',
          companyRegistrationId: 'DE123456789',
          ...accountRow,
        },
      ]),
  };

  const db = {
    select: () => select,
    transaction: (run: (tx: unknown) => Promise<unknown>) =>
      run({
        insert: (table: unknown) => ({
          values(values: Insert['values']) {
            if (table === orders) {
              attempted.push((values as Record<string, string>).reference);
            }
            if (table === orders && remaining > 0) {
              remaining -= 1;
              throw Object.assign(new Error('duplicate key'), {
                code: '23505',
              });
            }
            inserts.push({ table, values });
            // Awaited directly for the items, and via `.returning()` for the
            // order itself.
            const result = Promise.resolve() as Promise<void> & {
              returning: () => Promise<{ id: string }[]>;
            };
            result.returning = async () => [{ id: 'order-1' }];
            return result;
          },
        }),
      }) as Promise<unknown>,
  } as unknown as NodePgDatabase<typeof schema>;

  const orderRows = () =>
    inserts
      .filter((entry) => entry.table === orders)
      .map((entry) => entry.values as Record<string, unknown>);
  const itemRows = () =>
    (inserts.find((entry) => entry.table === orderItems)?.values ??
      []) as Record<string, unknown>[];

  return { db, orderRows, itemRows, attempted };
}

const locations: PickupLocation[] = [
  {
    key: 'speicherstadt',
    name: 'Speicherstadt Office',
    address: 'Am Sandtorkai 30',
  },
];

const delivery = deliveryConfigSchema.parse({
  zones: [
    {
      key: 'city',
      title: 'Hamburg city',
      freeFromMinor: 15_000,
      match: { postalPrefixes: ['20'] },
    },
    { key: 'rest', title: 'Everywhere else', match: { all: true } },
  ],
});

function service(
  db: NodePgDatabase<typeof schema>,
  billingAddressEnabled = true,
) {
  const addresses = { assertValid: jest.fn() } as unknown as AddressesService;
  // The mails are sent from a placed order and never allowed to fail it; what
  // they say is the templates' own suite.
  const notifications = {
    placed: jest.fn().mockResolvedValue(undefined),
  } as unknown as OrderNotifications;
  return new OrdersService(
    db,
    addresses,
    locations,
    delivery,
    { prefix: 'CK', timezone: 'UTC' },
    'EUR',
    (value: string) => /^DE[0-9]{9}$/.test(value),
    billingAddressEnabled,
    notifications,
  );
}

const address = (overrides: Record<string, unknown> = {}) => ({
  label: null,
  street: 'Hafenstraße 12',
  street2: null,
  postalCode: '20359',
  city: 'Hamburg',
  region: null,
  country: 'DE',
  ...overrides,
});

/** What a guest submits: nobody to resolve a party from, so they name one. */
const guestParty = { name: 'Ada Byron', registrationId: null };

const submission = (overrides: Record<string, unknown> = {}): OrderSubmission =>
  ({
    lines: [{ slug: 'hafen-espresso', unit: 'pack', pieces: 20 }],
    contact: { name: 'Ada', email: 'ada@example.com', phone: '+49 40 1' },
    fulfilmentMethod: 'delivery',
    // Null is "the party this account is registered as", which the server
    // reads for itself — the ordinary case, so it is the fixture's default.
    party: null,
    deliveryAddress: address(),
    pickupLocationKey: null,
    billingAddress: address(),
    paymentMethod: 'cash',
    preferredDate: null,
    customerNote: null,
    expectedTotalMinor: 3998,
    acceptPrivacy: true,
    ...overrides,
  }) as OrderSubmission;

describe('OrdersService.submit', () => {
  afterEach(() => jest.restoreAllMocks());

  it('writes the order and its lines, with the server’s own zone', async () => {
    const { db, orderRows, itemRows } = testDb();

    const placed = await service(db).submit(submission(), 'user-1', null);

    expect(placed.reference).toMatch(/^CK-\d{6}-\d{4}$/);
    expect(placed.publicToken).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(orderRows()[0]).toMatchObject({
      userId: 'user-1',
      status: 'requested',
      totalMinor: 3998,
      currency: 'EUR',
      // Resolved from the postal code against the deployment's zones — nothing
      // about the zone came from the submission.
      deliveryZoneKey: 'city',
      deliveryFreeFromMinor: 15_000,
      pickupLocationKey: null,
    });
    expect(itemRows()[0]).toMatchObject({
      productId: 'product-1',
      productSourceId: 'ERP-1',
      unit: 'pack',
      quantity: 2,
      pieces: 20,
      priceMinor: 1999,
      priceBasisPieces: 10,
      lineTotalMinor: 3998,
    });
  });

  it('snapshots the collection point and resolves no zone for a pickup', async () => {
    const { db, orderRows } = testDb();

    await service(db).submit(
      submission({
        fulfilmentMethod: 'pickup',
        deliveryAddress: null,
        pickupLocationKey: 'speicherstadt',
        party: guestParty,
      }),
      null,
      null,
    );

    expect(orderRows()[0]).toMatchObject({
      pickupLocationKey: 'speicherstadt',
      // The name and address as they read today: the config behind them is
      // editable, and an old order must stay readable.
      pickupLocationName: 'Speicherstadt Office',
      pickupLocationAddress: 'Am Sandtorkai 30',
      deliveryStreet: null,
      deliveryZoneKey: null,
    });
  });

  it('retries a collided reference with a new one', async () => {
    const { db, orderRows, attempted } = testDb(1);
    // Pinned rather than left to the generator: what this asserts is that the
    // retry draws again, and a random suffix that happened to repeat would
    // make the test lie about it either way.
    jest
      .spyOn(reference, 'orderReference')
      .mockReturnValueOnce('CK-260824-0001')
      .mockReturnValueOnce('CK-260824-0002');

    const placed = await service(db).submit(
      submission({ party: guestParty }),
      null,
      null,
    );

    expect(attempted).toEqual(['CK-260824-0001', 'CK-260824-0002']);
    expect(placed.reference).toBe('CK-260824-0002');
    // One rejected insert, one stored row.
    expect(orderRows()).toHaveLength(1);
  });

  it('gives up loudly rather than looping on a broken generator', async () => {
    const { db } = testDb(99);

    await expect(
      service(db).submit(submission({ party: guestParty }), null, null),
    ).rejects.toThrow(/free order reference/);
  });

  it('refuses a total the browser and the server disagree about', async () => {
    const { db, orderRows } = testDb();

    await expect(
      service(db).submit(
        submission({ expectedTotalMinor: 1999, party: guestParty }),
        null,
        null,
      ),
    ).rejects.toBeInstanceOf(CartChangedException);
    expect(orderRows()).toHaveLength(0);
  });

  it('needs a company for a bank transfer, whoever is invoiced', async () => {
    const { db } = testDb();

    await expect(
      service(db).submit(
        submission({ paymentMethod: 'bank-transfer', party: guestParty }),
        null,
        null,
      ),
    ).rejects.toMatchObject({
      response: { code: 'billing-details-required' },
    });
  });

  // The deployment's answer, not the browser's: a form drawn from an older
  // config would send one, and the order must not carry an address the shop
  // does not invoice to.
  it('stores no billing address where the deployment invoices none', async () => {
    const { db, orderRows } = testDb();

    await service(db, false).submit(submission(), 'user-1', null);

    expect(orderRows()[0]).toMatchObject({
      billingStreet: null,
      billingPostalCode: null,
      billingCity: null,
      billingCountry: null,
    });
  });

  it('refuses a submission with no billing address where it invoices one', async () => {
    const { db } = testDb();

    await expect(
      service(db).submit(submission({ billingAddress: null }), 'user-1', null),
    ).rejects.toMatchObject({ response: { code: 'billing-address-required' } });
  });

  it('reads the party off the account where the order names none', async () => {
    const { db, orderRows } = testDb();

    await service(db).submit(submission(), 'user-1', null);

    expect(orderRows()[0]).toMatchObject({
      partyName: 'Kontor GmbH',
      partyRegistrationId: 'DE123456789',
    });
  });

  it('invoices a private customer by name, whatever else their record carries', async () => {
    // A customer who registered as a person keeps their own name on the
    // invoice: the type is the answer, not whichever field is not empty.
    const { db, orderRows } = testDb(0, {
      customerType: 'person',
      companyRegistrationId: null,
    });

    await service(db).submit(
      submission({ paymentMethod: 'cash' }),
      'user-1',
      null,
    );

    expect(orderRows()[0]).toMatchObject({ partyName: 'Ada Byron' });
  });

  it('snapshots the party the order named instead', async () => {
    const { db, orderRows } = testDb();

    await service(db).submit(
      submission({
        party: { name: 'Nordwerk AG', registrationId: 'DE987654321' },
      }),
      'user-1',
      null,
    );

    expect(orderRows()[0]).toMatchObject({
      partyName: 'Nordwerk AG',
      partyRegistrationId: 'DE987654321',
    });
  });

  it('refuses a registration number in no configured shape', async () => {
    const { db } = testDb();

    await expect(
      service(db).submit(
        submission({ party: { name: 'Nordwerk AG', registrationId: 'XX1' } }),
        'user-1',
        null,
      ),
    ).rejects.toMatchObject({ response: { code: 'invalid-company-id' } });
  });

  it('has nobody to invoice where a guest names no party', async () => {
    const { db } = testDb();

    await expect(
      service(db).submit(submission(), null, null),
    ).rejects.toMatchObject({ response: { code: 'party-required' } });
  });

  it('refuses a collection point that does not exist', async () => {
    const { db } = testDb();

    await expect(
      service(db).submit(
        submission({
          fulfilmentMethod: 'pickup',
          deliveryAddress: null,
          pickupLocationKey: 'no-such-office',
          party: guestParty,
        }),
        null,
        null,
      ),
    ).rejects.toMatchObject({
      response: { code: 'unknown-pickup-location' },
    });
  });
});
