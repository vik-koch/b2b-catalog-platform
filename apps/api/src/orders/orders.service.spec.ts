import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { deliveryConfigSchema, OrderSubmission } from '@b2b-catalog-platform/shared';
import { AddressesService } from '../addresses/addresses.service';
import { PickupLocation } from '../config/deployment-config';
import * as schema from '../db/schema';
import { orderItems, orders } from '../db/schema';
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

interface Insert {
  table: unknown;
  values: Record<string, unknown> | Record<string, unknown>[];
}

/**
 * A drizzle stand-in: one select for the pricer, and a transaction whose first
 * `collisions` order inserts raise Postgres' unique-violation code.
 */
function testDb(collisions = 0) {
  const inserts: Insert[] = [];
  /** Every reference the service tried, collisions included. */
  const attempted: string[] = [];
  let remaining = collisions;
  const select = {
    from: () => select,
    where: () => Promise.resolve([product]),
  };

  const db = {
    select: () => select,
    transaction: (run: (tx: unknown) => Promise<unknown>) =>
      run({
        insert: (table: unknown) => ({
          values(values: Insert['values']) {
            if (table === orders) {
              attempted.push(
                (values as Record<string, string>).reference,
              );
            }
            if (table === orders && remaining > 0) {
              remaining -= 1;
              throw Object.assign(new Error('duplicate key'), { code: '23505' });
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
  { key: 'speicherstadt', name: 'Speicherstadt Office', description: 'Am Sandtorkai 30' },
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

function service(db: NodePgDatabase<typeof schema>) {
  const addresses = { assertValid: jest.fn() } as unknown as AddressesService;
  return new OrdersService(
    db,
    addresses,
    locations,
    delivery,
    { prefix: 'CK', timezone: 'UTC' },
    'EUR',
  );
}

const address = (overrides: Record<string, unknown> = {}) => ({
  label: null,
  companyName: 'Kontor GmbH',
  companyId: 'DE123456789',
  street: 'Hafenstraße 12',
  street2: null,
  postalCode: '20359',
  city: 'Hamburg',
  region: null,
  country: 'DE',
  phone: null,
  ...overrides,
});

const submission = (overrides: Record<string, unknown> = {}): OrderSubmission =>
  ({
    lines: [{ slug: 'hafen-espresso', unit: 'pack', quantity: 2 }],
    contact: { name: 'Ada', email: 'ada@example.com', phone: '+49 40 1' },
    fulfilmentMethod: 'delivery',
    deliveryAddress: address(),
    pickupLocationKey: null,
    billingAddress: address(),
    paymentMethod: 'cash',
    preferredTiming: null,
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

    const placed = await service(db).submit(submission(), null, null);

    expect(attempted).toEqual(['CK-260824-0001', 'CK-260824-0002']);
    expect(placed.reference).toBe('CK-260824-0002');
    // One rejected insert, one stored row.
    expect(orderRows()).toHaveLength(1);
  });

  it('gives up loudly rather than looping on a broken generator', async () => {
    const { db } = testDb(99);

    await expect(service(db).submit(submission(), null, null)).rejects.toThrow(
      /free order reference/,
    );
  });

  it('refuses a total the browser and the server disagree about', async () => {
    const { db, orderRows } = testDb();

    await expect(
      service(db).submit(submission({ expectedTotalMinor: 1999 }), null, null),
    ).rejects.toBeInstanceOf(CartChangedException);
    expect(orderRows()).toHaveLength(0);
  });

  it('needs the invoiced company for a bank transfer', async () => {
    const { db } = testDb();

    await expect(
      service(db).submit(
        submission({
          paymentMethod: 'bank-transfer',
          billingAddress: address({ companyName: null, companyId: null }),
        }),
        null,
        null,
      ),
    ).rejects.toMatchObject({
      response: { code: 'billing-details-required' },
    });
  });

  it('refuses a collection point that does not exist', async () => {
    const { db } = testDb();

    await expect(
      service(db).submit(
        submission({
          fulfilmentMethod: 'pickup',
          deliveryAddress: null,
          pickupLocationKey: 'no-such-office',
        }),
        null,
        null,
      ),
    ).rejects.toMatchObject({
      response: { code: 'unknown-pickup-location' },
    });
  });
});
