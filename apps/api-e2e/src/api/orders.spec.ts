import { readFileSync } from 'node:fs';
import { hash } from '@node-rs/argon2';
import axios, { AxiosResponse } from 'axios';
import { Client } from 'pg';
import { requireEnv } from '../support/env';
import {
  deleteMatching,
  messageBody,
  messagesMatching,
} from '../support/mailpit';

/**
 * Cart pricing and order submission (FR-CART-01…04, FR-ACC-01), end to end.
 *
 * Three questions this suite exists for, none of which a unit test can answer:
 * that the same cart is priced differently for a tiered customer and a guest;
 * that a submitted order is priced by the server rather than by the browser;
 * and that nothing staff-facing — the price basis, the private source id, the
 * tier — reaches a customer through an order.
 */

const SUFFIX = Math.random().toString(36).slice(2, 10);
const CUSTOMER = `e2e-orders-customer-${SUFFIX}@example.com`;
const OTHER = `e2e-orders-other-${SUFFIX}@example.com`;
const MANAGER = `e2e-orders-manager-${SUFFIX}@example.com`;
/** The contact on the one order this suite reads mail for. Its own address, so
 * the Mailpit queries below match nothing another suite (or another case here)
 * sent. */
const MAIL_CONTACT = `e2e-orders-mail-${SUFFIX}@example.com`;
const PASSWORD = 'e2e-orders-password';
const TIER_KEY = `e2e-orders-tier-${SUFFIX}`;
const SOURCE_PREFIX = `E2E-ORDERS-${SUFFIX}`;

/** €19.99 per ten pieces: the case where no piece has an exact price. */
const BASE_MINOR = 1999;
const BASIS = 10;
const TIER_MINOR = 1000;

const slugs = {
  boxed: `e2e-orders-boxed-${SUFFIX}`,
  hidden: `e2e-orders-hidden-${SUFFIX}`,
  deleted: `e2e-orders-deleted-${SUFFIX}`,
  /** Sold the same way, but takes no line note. */
  noNote: `e2e-orders-nonote-${SUFFIX}`,
  /** Ten to a pack, but the shop will not ship fewer than a hundred — the
   * case where the floor and the step are different figures. */
  stepped: `e2e-orders-stepped-${SUFFIX}`,
  /** On sale in every other respect, with nothing on the shelf
   * (FR-STOCK-04). */
  empty: `e2e-orders-empty-${SUFFIX}`,
};

/**
 * Pickup and delivery are answered from the deployment's own config, so the
 * expectations are read from it rather than restated here — a renamed office
 * or a re-cut zone should move this suite, not break it.
 */
const deployment = JSON.parse(
  readFileSync(requireEnv('DEPLOYMENT_CONFIG_FILE'), 'utf8'),
) as {
  pickup?: { locations: { key: string; name: string }[] };
  delivery?: {
    zones: {
      key: string;
      freeFromMinor?: number;
      match: { postalPrefixes?: string[] };
    }[];
  };
};
const PICKUP = deployment.pickup?.locations[0];
/** The first zone claimed by a postal prefix, and a code inside it. */
const PREFIX_ZONE = deployment.delivery?.zones.find(
  (zone) => zone.match.postalPrefixes?.length,
);
const IN_PREFIX_ZONE = `${PREFIX_ZONE?.match.postalPrefixes?.[0] ?? ''}359`;

/**
 * The whole contract shape of every order surface. Exhaustive on purpose: a
 * column added to a snapshot later reaches a customer silently, and this is the
 * assertion that stops it — the same guard `catalog.spec.ts` keeps over tiles.
 */
const ORDER_SUMMARY_KEYS = [
  'createdAt',
  'currency',
  'fulfilmentMethod',
  'itemCount',
  'paymentState',
  'reference',
  'status',
  'totalMinor',
];
const ORDER_LINE_KEYS = [
  'image',
  'lineTotalMinor',
  'linked',
  'name',
  'note',
  'pieces',
  'quantity',
  'slug',
  'unit',
];
const ORDER_DETAIL_KEYS = [
  ...ORDER_SUMMARY_KEYS,
  // What the shop says it has changed about the order (FR-ORD-03), up to the
  // version being shown.
  'changes',
  'billingAddress',
  'contact',
  'customerNote',
  'deliveryAddress',
  'deliveryZone',
  'lines',
  'party',
  'paymentMethod',
  'pickup',
  'preferredDate',
  'shipment',
  'statusReason',
].sort();
/** What staff see on top: the list it was priced from, who placed it, and the
 * lines in basis units (FR-UNIT-04). */
const ADMIN_DETAIL_KEYS = [
  ...ORDER_DETAIL_KEYS,
  // What the customer sees and what they have been told (FR-NOTIF-03) — two
  // questions, and staff's alone either way.
  'customerBehind',
  'customerRevisionNumber',
  'notifiedRevisionNumber',
  'notifiedStatuses',
  'customerEmail',
  'paidAt',
  'revisionNumber',
  'statusChangedAt',
  'tierKey',
].sort();
const ADMIN_LINE_KEYS = [
  ...ORDER_LINE_KEYS,
  'priceBasisPieces',
  'priceMinor',
].sort();
const ADMIN_LIST_KEYS = [
  ...ORDER_SUMMARY_KEYS,
  'contactName',
  'customerEmail',
  // Staff read the money column through the method as well as the state.
  'paymentMethod',
  // Which version the row describes, so its title links straight at it.
  'revisionNumber',
].sort();

const request = (method: 'get' | 'post') =>
  async function (url: string, body?: unknown, cookie?: string) {
    return axios.request({
      method,
      url,
      data: body,
      headers: cookie ? { Cookie: cookie } : {},
      validateStatus: () => true,
    });
  };
const get = (url: string, cookie?: string) =>
  request('get')(url, undefined, cookie);
const post = (url: string, body: unknown, cookie?: string) =>
  request('post')(url, body, cookie);

/**
 * What a refusal carries with it. A coded error travels as
 * `{ defined, code, status, message, data }`, so the payload a refusal answers
 * with — here the re-priced cart — sits one level in, under `data`.
 */
const refusal = (res: AxiosResponse) => res.data.data;

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

/** The party an order is invoiced to (FR-CART-09) — a field of the order, held
 * apart from the addresses. A guest has no account to resolve one from, so
 * theirs always names it. */
const party = (overrides: Record<string, unknown> = {}) => ({
  name: 'Kontor GmbH',
  registrationId: 'DE123456789',
  ...overrides,
});

const submission = (overrides: Record<string, unknown> = {}) => ({
  lines: [{ slug: slugs.boxed, unit: 'pack', pieces: 20 }],
  contact: {
    name: 'Ada Lovelace',
    email: 'ada@example.com',
    phone: '+49 40 7654321',
  },
  fulfilmentMethod: 'delivery',
  party: party(),
  deliveryAddress: address(),
  pickupLocationKey: null,
  billingAddress: address(),
  // The default party is a company, which is invoiced rather than paying cash
  // (FR-CART-04).
  paymentMethod: 'bank-transfer',
  preferredDate: null,
  customerNote: null,
  expectedTotalMinor: BASE_MINOR * 2,
  acceptPrivacy: true,
  ...overrides,
});

async function loginAs(email: string): Promise<string> {
  const res = await axios.post(
    '/auth/login',
    { email, password: PASSWORD },
    { validateStatus: () => true },
  );
  const cookie = (res.headers['set-cookie'] as string[] | undefined)
    ?.find((c) => c.startsWith('session='))
    ?.split(';')[0];
  if (!cookie) throw new Error(`login failed for ${email}: ${res.status}`);
  return cookie;
}

describe('Cart and orders (FR-CART-01…04)', () => {
  let client: Client;
  let customerCookie = '';
  let otherCookie = '';
  let managerCookie = '';
  let customerId = '';

  beforeAll(async () => {
    client = new Client({ connectionString: requireEnv('DATABASE_URL') });
    await client.connect();

    // This suite's own category, not whichever one sorts first. Products
    // reference a category `ON DELETE restrict`, and several other suites
    // hard-delete the category they created in their own teardown — borrowing
    // one means their cleanup fails against our foreign key, at whatever point
    // the two suites happen to interleave.
    const { rows: categories } = await client.query(
      `INSERT INTO categories ("sourceId", slug, name)
       VALUES ($1, $1, $1) RETURNING id`,
      [SOURCE_PREFIX.toLowerCase()],
    );
    const categoryId = categories[0].id;

    // Three products: one on sale, one never published, one soft-deleted. The
    // last two must be indistinguishable from a slug that never existed.
    const product = async (
      slug: string,
      state: 'live' | 'unpublished' | 'deleted',
      lineNoteEnabled = true,
      minPieceQty = 10,
      /** Both or neither: the stored state is the figure's shadow. */
      stockPieces: number | null = null,
    ) => {
      await client.query(
        `INSERT INTO products (
           "sourceId", slug, name, "defaultPriceMinor", "priceBasisPieces",
           "piecesPerPack", "packsPerBox", "minPieceQty", "boxVolume",
           "boxWeight", "boxCount", "categoryId", "lineNoteEnabled",
           "publishedAt", "deletedAt", "stockPieces", availability)
         VALUES ($1, $2, $3, $4, $5, 10, 4, $10, '0.240', '12.500', 1, $6, $7,
                 $8, $9, $11, $12)`,
        [
          `${SOURCE_PREFIX}-${slug}`,
          slug,
          `E2E ${slug}`,
          BASE_MINOR,
          BASIS,
          categoryId,
          lineNoteEnabled,
          state === 'unpublished' ? null : new Date(),
          state === 'deleted' ? new Date() : null,
          minPieceQty,
          stockPieces,
          stockPieces === null ? null : stockPieces > 0 ? 'in' : 'out',
        ],
      );
    };
    await product(slugs.boxed, 'live');
    await product(slugs.hidden, 'unpublished');
    await product(slugs.deleted, 'deleted');
    await product(slugs.noNote, 'live', false);
    await product(slugs.stepped, 'live', true, 100);
    await product(slugs.empty, 'live', true, 10, 0);

    const { rows: tiers } = await client.query(
      'INSERT INTO customer_tiers (key, label) VALUES ($1, $2) RETURNING id',
      [TIER_KEY, 'E2E Orders'],
    );
    await client.query(
      `INSERT INTO product_prices ("productId", "tierId", "priceMinor")
       SELECT id, $1, $2 FROM products WHERE slug = $3`,
      [tiers[0].id, TIER_MINOR, slugs.boxed],
    );

    const passwordHash = await hash(PASSWORD);
    const { rows: customers } = await client.query(
      `INSERT INTO users (email, "passwordHash", role, status, "tierId")
       VALUES ($1, $2, 'user', 'active', $3) RETURNING id`,
      [CUSTOMER, passwordHash, tiers[0].id],
    );
    customerId = customers[0].id;
    await client.query(
      `INSERT INTO users (email, "passwordHash", role, status)
       VALUES ($1, $2, 'user', 'active')`,
      [OTHER, passwordHash],
    );
    await client.query(
      `INSERT INTO users (email, "passwordHash", role, status)
       VALUES ($1, $2, 'manager', 'active')`,
      [MANAGER, passwordHash],
    );

    customerCookie = await loginAs(CUSTOMER);
    otherCookie = await loginAs(OTHER);
    managerCookie = await loginAs(MANAGER);
  });

  afterAll(async () => {
    await client.query(
      `DELETE FROM orders WHERE id IN (
         SELECT r."orderId" FROM order_items i
           JOIN order_revisions r ON r.id = i."revisionId"
          WHERE i."productSourceId" LIKE $1)`,
      [`${SOURCE_PREFIX}%`],
    );
    await client.query('DELETE FROM products WHERE "sourceId" LIKE $1', [
      `${SOURCE_PREFIX}%`,
    ]);
    // After the products, which reference it.
    await client.query('DELETE FROM categories WHERE "sourceId" = $1', [
      SOURCE_PREFIX.toLowerCase(),
    ]);
    await client.query('DELETE FROM users WHERE email = ANY($1)', [
      [CUSTOMER, OTHER, MANAGER],
    ]);
    await client.query('DELETE FROM customer_tiers WHERE key = $1', [TIER_KEY]);
    await client.end();
  });

  describe('/cart/preview', () => {
    it('prices a guest and a tiered customer differently from one body', async () => {
      const body = {
        lines: [{ slug: slugs.boxed, unit: 'pack', pieces: 20 }],
      };

      const guest = await post('/cart/preview', body);
      const customer = await post('/cart/preview', body, customerCookie);

      expect(guest.data.totalMinor).toBe(BASE_MINOR * 2);
      expect(customer.data.totalMinor).toBe(TIER_MINOR * 2);
      // A guest is priced without ever learning that tiers exist.
      expect(JSON.stringify(guest.data)).not.toContain('tier');
    });

    it('never serializes the price basis or the private source id', async () => {
      const res = await post('/cart/preview', {
        lines: [{ slug: slugs.boxed, unit: 'piece', pieces: 20 }],
      });

      const body = JSON.stringify(res.data);
      expect(body).not.toContain('priceBasisPieces');
      expect(body).not.toContain(SOURCE_PREFIX);
      // The multiplicable piece figure is published; the display one stays a
      // display one.
      expect(res.data.lines[0].prices).toMatchObject({
        pieceLotMinor: BASE_MINOR,
        pieceMilliMinor: 199_900,
      });
      expect(res.data.lines[0].lineTotalMinor).toBe(BASE_MINOR * 2);
    });

    it('answers `unavailable` for unpublished, deleted and unknown alike', async () => {
      const res = await post('/cart/preview', {
        lines: [
          { slug: slugs.hidden, unit: 'pack', pieces: 10 },
          { slug: slugs.deleted, unit: 'pack', pieces: 10 },
          { slug: `no-such-product-${SUFFIX}`, unit: 'pack', pieces: 10 },
        ],
      });

      expect(res.status).toBe(200);
      expect(
        res.data.lines.map((line: { issues: string[] }) => line.issues),
      ).toEqual([['unavailable'], ['unavailable'], ['unavailable']]);
      expect(res.data.complete).toBe(false);
    });

    it('flags an out-of-stock line and prices it anyway', async () => {
      // Listed, reachable and priced (FR-STOCK-04): only the order is refused,
      // and the count behind the state never leaves the API.
      const res = await post('/cart/preview', {
        lines: [{ slug: slugs.empty, unit: 'pack', pieces: 10 }],
      });

      expect(res.status).toBe(200);
      expect(res.data.lines[0].issues).toEqual(['out-of-stock']);
      expect(res.data.lines[0].availability).toBe('out');
      expect(res.data.lines[0].lineTotalMinor).toBe(BASE_MINOR);
      expect(res.data.complete).toBe(true);
      expect(JSON.stringify(res.data)).not.toContain('stockPieces');
    });

    it('corrects a below-minimum piece quantity instead of refusing it', async () => {
      const res = await post('/cart/preview', {
        lines: [{ slug: slugs.boxed, unit: 'piece', pieces: 3 }],
      });

      expect(res.data.lines[0]).toMatchObject({
        pieces: 10,
        issues: ['quantity-corrected'],
        lineTotalMinor: BASE_MINOR,
      });
    });

    // The floor and the step are different figures: the shop will not ship
    // fewer than a hundred, but above that it picks them ten at a time. The
    // rule this replaced pushed 141 to 200.
    it('steps a piece quantity by the pack, not by the minimum', async () => {
      const res = await post('/cart/preview', {
        lines: [
          { slug: slugs.stepped, unit: 'piece', pieces: 141 },
          { slug: slugs.stepped, unit: 'piece', pieces: 140 },
          { slug: slugs.stepped, unit: 'piece', pieces: 90 },
        ],
      });

      expect(res.status).toBe(200);
      expect(res.data.lines.map((l: { pieces: number }) => l.pieces)).toEqual(
        // Up to the next whole pack; left alone; lifted to the minimum.
        [150, 140, 100],
      );
      expect(res.data.lines[1].issues).toEqual([]);
      // Fourteen packs of ten at 19.99 the pack-worth.
      expect(res.data.lines[1].lineTotalMinor).toBe(BASE_MINOR * 14);
    });

    // The minimum is one figure in pieces, and it holds whatever unit the line
    // is being read in: ordering a single pack of ten used to walk straight
    // under a hundred-piece floor.
    it('holds the same minimum whichever unit the line is read in', async () => {
      const res = await post('/cart/preview', {
        lines: [
          { slug: slugs.stepped, unit: 'pack', pieces: 10 },
          { slug: slugs.stepped, unit: 'box', pieces: 40 },
        ],
      });

      expect(res.status).toBe(200);
      // Ten packs of ten in one, two and a half boxes of forty in the other —
      // the same hundred pieces either way.
      expect(res.data.lines[0]).toMatchObject({
        pieces: 100,
        issues: ['quantity-corrected'],
      });
      expect(res.data.lines[1]).toMatchObject({
        pieces: 100,
        issues: ['quantity-corrected'],
      });
    });

    /*
     * FR-SET-02: counted in pieces, allocated rather than summed, and read
     * from both ends of the edge at once. The seeded takeaway cup and its two
     * lids are the demo's own pairing.
     */
    describe('what a cart is short of what it is sold with', () => {
      const CUP = 'takeaway-cup-300';
      const FLAT = 'takeaway-lid-flat';
      const DOMED = 'takeaway-lid-domed';
      const shortOf = (data: {
        lines: { slug: string; pairingShortPieces: number | null }[];
      }) =>
        Object.fromEntries(
          data.lines
            .filter((line) => line.pairingShortPieces !== null)
            .map((line) => [line.slug, line.pairingShortPieces]),
        );

      it('says nothing about a cart with no pairings in it', async () => {
        const res = await post('/cart/preview', {
          lines: [{ slug: slugs.boxed, unit: 'pack', pieces: 20 }],
        });

        expect(res.data.lines[0].pairingShortPieces).toBeNull();
      });

      it('is short by the whole line where no counterpart was added', async () => {
        const res = await post('/cart/preview', {
          lines: [{ slug: CUP, unit: 'piece', pieces: 50 }],
        });

        expect(shortOf(res.data)).toEqual({ [CUP]: 50 });
      });

      it('names only the side that is short, whichever that is', async () => {
        const res = await post('/cart/preview', {
          lines: [
            { slug: CUP, unit: 'piece', pieces: 100 },
            { slug: FLAT, unit: 'piece', pieces: 80 },
          ],
        });

        // The lid's 80 are covered by the cup's 100 and say nothing; the cup
        // can draw only 80 and is 20 short.
        expect(shortOf(res.data)).toEqual({ [CUP]: 20 });
      });

      it('lets two counterparts answer one product between them', async () => {
        const res = await post('/cart/preview', {
          lines: [
            { slug: CUP, unit: 'piece', pieces: 6 },
            { slug: FLAT, unit: 'piece', pieces: 3 },
            { slug: DOMED, unit: 'piece', pieces: 3 },
          ],
        });

        // Six cups answered by three of each lid — the client's own case, and
        // the reason the model is edges rather than a set.
        expect(shortOf(res.data)).toEqual({});
      });

      it('ignores a line the shop no longer offers', async () => {
        const res = await post('/cart/preview', {
          lines: [
            { slug: CUP, unit: 'piece', pieces: 10 },
            { slug: FLAT, unit: 'piece', pieces: 10 },
            { slug: slugs.deleted, unit: 'pack', pieces: 10 },
          ],
        });

        const withdrawn = res.data.lines.find(
          (line: { slug: string }) => line.slug === slugs.deleted,
        );
        expect(withdrawn.pairingShortPieces).toBeNull();
        expect(shortOf(res.data)).toEqual({});
      });
    });

    it('adds up the shipment estimate across the lines', async () => {
      const res = await post('/cart/preview', {
        lines: [{ slug: slugs.boxed, unit: 'box', pieces: 80 }],
      });

      expect(res.data.shipment).toMatchObject({
        cartons: 2,
        weight: '25.000',
        approximate: false,
      });
    });
  });

  describe('POST /orders', () => {
    it('places a guest order and answers with a reference and a token', async () => {
      const res = await post('/orders', submission());

      expect(res.status).toBe(201);
      expect(res.data.reference).toMatch(/^[A-Z0-9]+-\d{6}-\d{4}$/);
      expect(res.data.publicToken).toMatch(/^[A-Za-z0-9_-]{32}$/);

      // The mailed link's view, which is the guest's only record of it.
      const read = await get(`/orders/by-token/${res.data.publicToken}`);
      expect(read.status).toBe(200);
      expect(read.data.reference).toBe(res.data.reference);
      expect(Object.keys(read.data).sort()).toEqual(ORDER_DETAIL_KEYS);
      expect(Object.keys(read.data.lines[0]).sort()).toEqual(ORDER_LINE_KEYS);
      expect(read.data.lines[0]).toMatchObject({
        unit: 'pack',
        quantity: 2,
        pieces: 20,
        lineTotalMinor: BASE_MINOR * 2,
      });
      const body = JSON.stringify(read.data);
      expect(body).not.toContain(SOURCE_PREFIX);
      expect(body).not.toContain('priceBasisPieces');
      expect(body).not.toContain('tierKey');
    });

    it('places a pickup order, snapshotting the office it was collected from', async () => {
      const res = await post(
        '/orders',
        submission({
          fulfilmentMethod: 'pickup',
          deliveryAddress: null,
          pickupLocationKey: PICKUP?.key,
        }),
      );

      expect(res.status).toBe(201);
      const read = await get(`/orders/by-token/${res.data.publicToken}`);
      expect(read.status).toBe(200);
      expect(read.data.fulfilmentMethod).toBe('pickup');
      expect(read.data.deliveryAddress).toBeNull();
      expect(read.data.deliveryZone).toBeNull();
      // The key *and* the office as it read at the time: config is editable,
      // and a past order has to stay readable through a rename.
      expect(read.data.pickup).toMatchObject({
        key: PICKUP?.key,
        name: PICKUP?.name,
      });
    });

    it('resolves the delivery zone from the address, not from the browser', async () => {
      const res = await post(
        '/orders',
        submission({
          deliveryAddress: address({ postalCode: IN_PREFIX_ZONE }),
        }),
      );

      expect(res.status).toBe(201);
      const read = await get(`/orders/by-token/${res.data.publicToken}`);
      // Snapshotted with the threshold it promised — advisory, and never a
      // figure the browser got to choose.
      expect(read.data.deliveryZone).toEqual({
        key: PREFIX_ZONE?.key,
        freeFromMinor: PREFIX_ZONE?.freeFromMinor ?? null,
      });
      expect(read.data.pickup).toBeNull();
    });

    it('refuses a total the browser and the server disagree about', async () => {
      const res = await post(
        '/orders',
        submission({ expectedTotalMinor: BASE_MINOR }),
      );

      expect(res.status).toBe(409);
      expect(res.data.code).toBe('cart-changed');
      // The corrected cart travels with the refusal.
      expect(refusal(res).preview.totalMinor).toBe(BASE_MINOR * 2);
    });

    it('prices a signed-in customer from their own list', async () => {
      const res = await post(
        '/orders',
        submission({ expectedTotalMinor: TIER_MINOR * 2 }),
        customerCookie,
      );

      expect(res.status).toBe(201);
      const read = await get(
        `/account/orders/${res.data.reference}`,
        customerCookie,
      );
      expect(read.data.totalMinor).toBe(TIER_MINOR * 2);
    });

    it('refuses an unavailable line rather than dropping it', async () => {
      const res = await post(
        '/orders',
        submission({
          lines: [{ slug: slugs.hidden, unit: 'pack', pieces: 10 }],
          expectedTotalMinor: 0,
        }),
      );

      expect(res.status).toBe(409);
      expect(refusal(res).preview.lines[0].issues).toEqual(['unavailable']);
    });

    it('refuses an order holding an out-of-stock line', async () => {
      const res = await post(
        '/orders',
        submission({
          lines: [{ slug: slugs.empty, unit: 'pack', pieces: 10 }],
          expectedTotalMinor: BASE_MINOR,
        }),
      );

      expect(res.status).toBe(409);
      expect(refusal(res).preview.lines[0].issues).toEqual(['out-of-stock']);
    });

    it('needs the invoiced company for a bank transfer', async () => {
      const res = await post(
        '/orders',
        submission({
          paymentMethod: 'bank-transfer',
          party: party({ name: 'Ada Lovelace', registrationId: null }),
        }),
      );

      expect(res.status).toBe(400);
      expect(res.data.code).toBe('billing-details-required');
    });

    it('refuses cash for an order invoiced to a company', async () => {
      const res = await post('/orders', submission({ paymentMethod: 'cash' }));

      expect(res.status).toBe(400);
      expect(res.data.code).toBe('cash-not-available');
    });

    // The same rule registration is checked against — a picker and a mask are
    // entry aids, and the API applies the deployment's formats itself.
    it('refuses a registration number matching no configured format', async () => {
      const res = await post(
        '/orders',
        submission({ party: party({ registrationId: 'DE12' }) }),
      );

      expect(res.status).toBe(400);
      expect(res.data.code).toBe('invalid-company-id');
    });

    it('refuses a collection point that does not exist', async () => {
      const res = await post(
        '/orders',
        submission({
          fulfilmentMethod: 'pickup',
          deliveryAddress: null,
          pickupLocationKey: 'no-such-office',
        }),
      );

      expect(res.status).toBe(400);
      expect(res.data.code).toBe('unknown-pickup-location');
    });

    it('refuses a note the product no longer takes, and shows it stripped', async () => {
      const res = await post(
        '/orders',
        submission({
          lines: [
            {
              slug: slugs.noNote,
              unit: 'pack',
              pieces: 20,
              note: '100 in red',
            },
          ],
        }),
      );

      // An advisory in the preview is still a refusal at submission: the note
      // goes, and the customer sees it go before the order is placed without it.
      expect(res.status).toBe(409);
      expect(refusal(res).preview.lines[0]).toMatchObject({
        note: null,
        issues: ['note-not-allowed'],
      });
    });

    // The change the lens model is: two packs of a four-pack box is a perfectly
    // ordinary order, and it reads back as the 0.5 bx it was placed as while
    // the pieces stay the integer everything is derived from.
    it('places an order for a part box and reads it back as one', async () => {
      const res = await post(
        '/orders',
        submission({
          lines: [{ slug: slugs.boxed, unit: 'box', pieces: 20 }],
          expectedTotalMinor: BASE_MINOR * 2,
        }),
      );

      expect(res.status).toBe(201);
      const read = await get(`/orders/by-token/${res.data.publicToken}`);
      expect(read.data.lines[0]).toMatchObject({
        unit: 'box',
        quantity: 0.5,
        pieces: 20,
        lineTotalMinor: BASE_MINOR * 2,
      });
    });

    it('drops a submission whose honeypot is filled', async () => {
      const res = await post(
        '/orders',
        submission({ website: 'http://spam.example' }),
      );

      expect(res.status).toBe(400);
      // Its own code, not a borrowed one: a person tripped by an autofill must
      // not be told a full cart is empty.
      expect(res.data.code).toBe('rejected');
    });
  });

  // FR-NOTIF-05/06. Two queries rather than one: Mailpit's search has no OR and
  // no grouping, and a parenthesised query silently matches nothing.
  describe('the mails an order produces', () => {
    const customerMail = `to:"${MAIL_CONTACT}"`;
    const staffInbox = `to:"${requireEnv('MAIL_STAFF_TO')}"`;
    const staffMail = `${staffInbox} subject:"New order request"`;
    // This suite places more than one order, and both notify the same inbox —
    // so an assertion about one of them is scoped by its own reference.
    const about = (reference: string) => `subject:"${reference}"`;
    let reference = '';
    let publicToken = '';

    beforeAll(async () => {
      await Promise.all([customerMail, staffMail].map(deleteMatching));
      const res = await post(
        '/orders',
        submission({
          contact: {
            name: 'Ada Lovelace',
            email: MAIL_CONTACT,
            phone: '+49 40 7654321',
          },
        }),
      );
      reference = res.data.reference;
      publicToken = res.data.publicToken;
    });

    afterAll(async () => {
      await Promise.all([customerMail, staffMail].map(deleteMatching));
    });

    it('sends the customer their order, with the link that opens it', async () => {
      const [message] = await messagesMatching(
        `${customerMail} ${about(reference)}`,
      );
      expect(message).toBeDefined();
      expect(message.Subject).toContain(reference);

      const body = await messageBody(message.ID);
      // The token link is what a guest has instead of an account.
      expect(body.HTML).toContain(`/orders/${publicToken}`);
      expect(body.Text).toContain(`/orders/${publicToken}`);
      // The lines are in it, and nothing staff-facing is.
      expect(body.Text).toContain(`E2E ${slugs.boxed}`);
      expect(body.HTML).not.toContain(TIER_KEY);
    });

    // An account holder can open the order signed in, so the capability URL
    // is not mailed to them at all.
    it('links a signed-in customer to their own order page, with no token', async () => {
      await deleteMatching(customerMail);
      const res = await post(
        '/orders',
        submission({
          contact: {
            name: 'Ada Lovelace',
            email: MAIL_CONTACT,
            phone: '+49 40 7654321',
          },
          expectedTotalMinor: TIER_MINOR * 2,
        }),
        customerCookie,
      );
      expect(res.status).toBe(201);

      const [message] = await messagesMatching(
        `to:"${MAIL_CONTACT}" ${about(res.data.reference)}`,
      );
      expect(message).toBeDefined();
      const body = await messageBody(message.ID);
      expect(body.HTML).toContain(`/account/orders/${res.data.reference}`);
      expect(body.HTML).not.toContain(res.data.publicToken);
      expect(body.Text).not.toContain(res.data.publicToken);
    });

    it('tells the shop, linking into the admin order view', async () => {
      const [message] = await messagesMatching(
        `${staffInbox} ${about(reference)}`,
      );
      expect(message).toBeDefined();

      const body = await messageBody(message.ID);
      expect(body.HTML).toContain(`/admin/orders/${reference}`);
      expect(body.Text).toContain(MAIL_CONTACT);
    });

    // FR-NOTIF-03. The mail says what the order now is, so the reason a
    // refusal carries has to be in it — being told no without being told why
    // is the mail nobody can answer. It goes out because the move asked for it:
    // nothing here writes to a customer that nobody chose to write to.
    it('writes to the customer when the move asks it to', async () => {
      await deleteMatching(customerMail);
      const placed = await post(
        '/orders',
        submission({
          contact: {
            name: 'Ada Lovelace',
            email: MAIL_CONTACT,
            phone: '+49 40 7654321',
          },
        }),
      );
      await deleteMatching(customerMail);

      const res = await post(
        `/admin/orders/${placed.data.reference}/status`,
        {
          to: 'declined',
          reason: 'Out of stock until October',
          notify: true,
          markPaid: false,
        },
        managerCookie,
      );
      expect(res.status).toBe(200);

      const [message] = await messagesMatching(
        `${customerMail} ${about(placed.data.reference)}`,
      );
      expect(message).toBeDefined();
      const body = await messageBody(message.ID);
      expect(body.Text).toContain('Out of stock until October');
      // A guest reads it through the link they were mailed.
      expect(body.HTML).toContain(`/orders/${placed.data.publicToken}`);
    });
  });

  /**
   * Order processing (FR-ORD-01/02/04). What is worth pinning across the wire
   * is the half a unit test cannot reach: that the transition table is
   * actually consulted by both callers, that the second axis moves with the
   * first where it should and stays put where it should not, and that a race
   * between two managers has one winner.
   */
  describe('moving an order through its states', () => {
    const place = async (
      overrides: Record<string, unknown> = {},
      cookie?: string,
    ) => {
      const res = await post(
        '/orders',
        submission({
          expectedTotalMinor: cookie ? TIER_MINOR * 2 : BASE_MINOR * 2,
          ...overrides,
        }),
        cookie,
      );
      expect(res.status).toBe(201);
      return res.data.reference as string;
    };
    const move = (reference: string, body: unknown, cookie: string) =>
      post(`/admin/orders/${reference}/status`, body, cookie);

    it('accepts a request and starts waiting for the transfer', async () => {
      const reference = await place();

      const res = await move(
        reference,
        { to: 'approved', reason: null, notify: false, markPaid: false },
        managerCookie,
      );

      expect(res.status).toBe(200);
      expect(res.data).toMatchObject({
        status: 'approved',
        paymentState: 'awaiting',
        statusReason: null,
        paidAt: null,
      });
      expect(Object.keys(res.data).sort()).toEqual(ADMIN_DETAIL_KEYS);
    });

    it('leaves a cash order not due: cash exists at the handover', async () => {
      const reference = await place({
        // A private customer, since a company is invoiced rather than paying
        // cash (FR-CART-04).
        party: party({ name: 'Ada Lovelace', registrationId: null }),
        paymentMethod: 'cash',
      });

      const res = await move(
        reference,
        { to: 'approved', reason: null, notify: false, markPaid: false },
        managerCookie,
      );

      expect(res.data.paymentState).toBe('not-due');
    });

    it('refuses to decline without saying why', async () => {
      const reference = await place();

      const res = await move(
        reference,
        { to: 'declined', reason: null, notify: false, markPaid: false },
        managerCookie,
      );

      expect(res.status).toBe(400);
      expect(res.data.code).toBe('reason-required');
    });

    it('declines with a reason, and keeps the order', async () => {
      const reference = await place();

      const res = await move(
        reference,
        {
          to: 'declined',
          reason: 'Out of stock until October',
          notify: false,
          markPaid: false,
        },
        managerCookie,
      );

      expect(res.status).toBe(200);
      expect(res.data.status).toBe('declined');
      expect(res.data.statusReason).toBe('Out of stock until October');
      // The customer reads the reason on their own order, not only in a mail.
      const mine = await get(`/admin/orders/${reference}`, managerCookie);
      expect(mine.data.statusReason).toBe('Out of stock until October');
    });

    it('refuses a move the order has already made', async () => {
      const reference = await place();
      expect(
        (
          await move(
            reference,
            { to: 'approved', reason: null, notify: false, markPaid: false },
            managerCookie,
          )
        ).status,
      ).toBe(200);

      const again = await move(
        reference,
        { to: 'approved', reason: null, notify: false, markPaid: false },
        managerCookie,
      );

      expect(again.status).toBe(409);
      expect(again.data.code).toBe('transition-not-allowed');
    });

    it('walks an accepted order to ready and then to completed', async () => {
      const reference = await place();
      await move(
        reference,
        { to: 'approved', reason: null, notify: false, markPaid: false },
        managerCookie,
      );

      const ready = await move(
        reference,
        { to: 'ready', reason: null, notify: false, markPaid: false },
        managerCookie,
      );
      expect(ready.data.status).toBe('ready');
      // Being ready says nothing about the money: the two axes are separate.
      expect(ready.data.paymentState).toBe('awaiting');

      const done = await move(
        reference,
        { to: 'completed', reason: null, notify: false, markPaid: false },
        managerCookie,
      );
      expect(done.data.status).toBe('completed');
    });

    it('keeps a customer out of the staff transitions', async () => {
      const reference = await place({}, customerCookie);

      expect(
        (
          await move(
            reference,
            { to: 'approved', reason: null, notify: false, markPaid: false },
            customerCookie,
          )
        ).status,
      ).toBe(403);
    });

    it('lets a customer call off their own order, and stops waiting for money', async () => {
      const reference = await place({}, customerCookie);
      await move(
        reference,
        { to: 'approved', reason: null, notify: false, markPaid: false },
        managerCookie,
      );
      // Approving it made the transfer due; cancelling it un-dues what was
      // never paid.
      const cancel = await post(
        `/account/orders/${reference}/cancel`,
        { reason: 'Ordered twice by mistake' },
        customerCookie,
      );

      // Not from `approved`, though: by then the shop is working on it.
      expect(cancel.status).toBe(409);
      expect(cancel.data.code).toBe('transition-not-allowed');

      const fresh = await place({}, customerCookie);
      const off = await post(
        `/account/orders/${fresh}/cancel`,
        { reason: 'Ordered twice by mistake' },
        customerCookie,
      );

      expect(off.status).toBe(200);
      expect(off.data).toMatchObject({
        status: 'cancelled',
        paymentState: 'not-due',
        statusReason: 'Ordered twice by mistake',
      });
      expect(Object.keys(off.data).sort()).toEqual(ORDER_DETAIL_KEYS);
    });

    it('lets a customer call an order off without saying why', async () => {
      const reference = await place({}, customerCookie);

      const off = await post(
        `/account/orders/${reference}/cancel`,
        { reason: null },
        customerCookie,
      );

      expect(off.status).toBe(200);
      expect(off.data.status).toBe('cancelled');
      expect(off.data.statusReason).toBeNull();
    });

    it('answers 404 — not 403 — when cancelling somebody else’s order', async () => {
      const reference = await place({}, customerCookie);

      const res = await post(
        `/account/orders/${reference}/cancel`,
        { reason: 'Not mine' },
        otherCookie,
      );

      expect(res.status).toBe(404);
      expect(res.data.code).toBe('order-not-found');
    });

    it('records a payment once, and only once', async () => {
      const reference = await place();
      await move(
        reference,
        { to: 'approved', reason: null, notify: false, markPaid: false },
        managerCookie,
      );

      const paid = await post(
        `/admin/orders/${reference}/payment`,
        { paid: true },
        managerCookie,
      );
      expect(paid.status).toBe(200);
      expect(paid.data.paymentState).toBe('paid');
      expect(paid.data.paidAt).not.toBeNull();
      // And it did not move the order along: the shop still has to hand it over.
      expect(paid.data.status).toBe('approved');

      const again = await post(
        `/admin/orders/${reference}/payment`,
        { paid: true },
        managerCookie,
      );
      expect(again.status).toBe(409);
      expect(again.data.code).toBe('payment-not-recordable');
    });

    /**
     * The undo, for the box ticked on the wrong order. What it clears *to* is
     * derived, never remembered: an accepted bank-transfer order owes money
     * again, because that is what its method and status say.
     */
    it('takes a recorded payment back, to what the order owes', async () => {
      const reference = await place();
      await move(
        reference,
        { to: 'approved', reason: null, notify: false, markPaid: false },
        managerCookie,
      );
      await post(
        `/admin/orders/${reference}/payment`,
        { paid: true },
        managerCookie,
      );

      const cleared = await post(
        `/admin/orders/${reference}/payment`,
        { paid: false },
        managerCookie,
      );
      expect(cleared.status).toBe(200);
      expect(cleared.data.paymentState).toBe('awaiting');
      expect(cleared.data.paidAt).toBeNull();
      expect(cleared.data.status).toBe('approved');

      // Nothing left to clear: the same refusal recording twice gets.
      const again = await post(
        `/admin/orders/${reference}/payment`,
        { paid: false },
        managerCookie,
      );
      expect(again.status).toBe(409);
      expect(again.data.code).toBe('payment-not-recordable');
    });

    it('has nothing to record on an order that ended', async () => {
      const reference = await place();
      await move(
        reference,
        {
          to: 'declined',
          reason: 'Nothing left',
          notify: false,
          markPaid: false,
        },
        managerCookie,
      );

      const res = await post(
        `/admin/orders/${reference}/payment`,
        { paid: true },
        managerCookie,
      );

      expect(res.status).toBe(409);
      expect(res.data.code).toBe('payment-not-recordable');
    });

    /** Staff's undo. The mis-click has to be recoverable: without this an
     * order refused by accident is stuck at the wrong answer, and the only way
     * back is asking the customer to order again under a new reference. */
    it('reopens an order that ended, clearing the reason with it', async () => {
      const reference = await place();
      await move(
        reference,
        {
          to: 'declined',
          reason: 'Meant to click the other one',
          notify: false,
          markPaid: false,
        },
        managerCookie,
      );

      const back = await move(
        reference,
        { to: 'requested', reason: null, notify: false, markPaid: false },
        managerCookie,
      );

      expect(back.status).toBe(200);
      expect(back.data.status).toBe('requested');
      // The reason belonged to the ending that has just been undone.
      expect(back.data.statusReason).toBeNull();
      // And it can be answered again from there, like any other request.
      const answered = await move(
        reference,
        { to: 'approved', reason: null, notify: false, markPaid: false },
        managerCookie,
      );
      expect(answered.data.status).toBe('approved');
    });

    it('does not let a customer reopen their own cancelled order', async () => {
      const reference = await place({}, customerCookie);
      await post(
        `/account/orders/${reference}/cancel`,
        { reason: null },
        customerCookie,
      );

      // The customer's own route offers one move and names no target, so the
      // only way to ask is the staff one — which they cannot reach at all.
      expect(
        (
          await move(
            reference,
            { to: 'requested', reason: null, notify: false, markPaid: false },
            customerCookie,
          )
        ).status,
      ).toBe(403);
    });

    it('answers 404 for a reference that is nobody’s order', async () => {
      const res = await move(
        `NO-SUCH-${SUFFIX}`,
        { to: 'approved', reason: null, notify: false, markPaid: false },
        managerCookie,
      );

      expect(res.status).toBe(404);
      expect(res.data.code).toBe('order-not-found');
    });
  });

  /**
   * Adjustments (FR-ORD-03). A new version of the order, so what is worth
   * pinning is that the old one survives it, that a line nobody touched keeps
   * the price it was quoted at, that the rules the checkout applies still
   * apply — and that two managers adjusting one order have one winner.
   */
  describe('adjusting an order', () => {
    const place = async (
      overrides: Record<string, unknown> = {},
      cookie?: string,
    ) => {
      const res = await post(
        '/orders',
        submission({
          expectedTotalMinor: cookie ? TIER_MINOR * 2 : BASE_MINOR * 2,
          ...overrides,
        }),
        cookie,
      );
      expect(res.status).toBe(201);
      return res.data as { reference: string; publicToken: string };
    };

    /** The order as it stands, ready to be sent back with one thing changed —
     * which is what the admin screen holds. */
    const adjustment = (overrides: Record<string, unknown> = {}) => ({
      lines: [
        {
          slug: slugs.boxed,
          units: 2,
          unit: 'pack',
          note: null,
          priceMinor: BASE_MINOR,
          priceBasisPieces: BASIS,
        },
      ],
      contact: {
        name: 'Ada Lovelace',
        email: 'ada@example.com',
        phone: '+49 40 7654321',
      },
      party: party(),
      fulfilmentMethod: 'delivery',
      deliveryAddress: address(),
      pickupLocationKey: null,
      billingAddress: address(),
      paymentMethod: 'bank-transfer',
      tierKey: null,
      note: 'Agreed on the phone',
      basedOnRevision: 1,
      ...overrides,
    });

    const adjust = (reference: string, body: unknown, cookie = managerCookie) =>
      post(`/admin/orders/${reference}/adjustment`, body, cookie);

    /** The version the order is on. Every move writes one (ADR 0051), so an
     * order that has been answered is past revision 1 before anything changes
     * it — and a change written against the wrong one is refused, which is the
     * concurrency guard doing its job. */
    const onRevision = async (reference: string): Promise<number> =>
      (await get(`/admin/orders/${reference}`, managerCookie)).data
        .revisionNumber;
    const preview = (reference: string, body: unknown) =>
      post(
        `/admin/orders/${reference}/adjustment/preview`,
        body,
        managerCookie,
      );

    it('writes a new version, keeping the reference and the link', async () => {
      const placed = await place();

      const res = await adjust(
        placed.reference,
        adjustment({ lines: [{ ...adjustment().lines[0], units: 3 }] }),
      );

      expect(res.status).toBe(200);
      expect(res.data).toMatchObject({
        reference: placed.reference,
        // A change is not a move: the order stands where it stood.
        status: 'requested',
        revisionNumber: 2,
        totalMinor: BASE_MINOR * 3,
        // Nobody has told the customer, so they are still on what they sent —
        // an unannounced change is not theirs to see.
        customerRevisionNumber: 1,
        notifiedRevisionNumber: 1,
        customerBehind: true,
      });
      expect(Object.keys(res.data).sort()).toEqual(ADMIN_DETAIL_KEYS);
      // The mailed link still opens it — and shows the version it described,
      // which is the one the customer was last written to about.
      const token = await get(`/orders/by-token/${placed.publicToken}`);
      expect(token.status).toBe(200);
      expect(token.data.totalMinor).toBe(BASE_MINOR * 2);
      // And the version it superseded is still there.
      const { rows } = await client.query(
        `SELECT r."revisionNumber", r."totalMinor" FROM order_revisions r
           JOIN orders o ON o.id = r."orderId"
          WHERE o.reference = $1 ORDER BY r."revisionNumber"`,
        [placed.reference],
      );
      expect(rows).toEqual([
        { revisionNumber: 1, totalMinor: BASE_MINOR * 2 },
        { revisionNumber: 2, totalMinor: BASE_MINOR * 3 },
      ]);
    });

    it('keeps what the customer wrote, and what they were quoted', async () => {
      const placed = await place({
        preferredDate: '2099-12-31',
        customerNote: 'Ring the bell twice',
      });

      // Nothing about the line is touched — and its price is a figure the
      // catalog no longer offers this order, since the adjustment names no
      // list at all.
      await adjust(placed.reference, adjustment());

      const res = await get(`/admin/orders/${placed.reference}`, managerCookie);
      expect(res.data).toMatchObject({
        preferredDate: '2099-12-31',
        customerNote: 'Ring the bell twice',
        totalMinor: BASE_MINOR * 2,
      });
    });

    it('prices a line it is given no price for, from the named list', async () => {
      const placed = await place();

      const res = await preview(
        placed.reference,
        adjustment({
          tierKey: TIER_KEY,
          lines: [
            {
              slug: slugs.boxed,
              units: 2,
              unit: 'pack',
              note: null,
              priceMinor: null,
              priceBasisPieces: null,
            },
          ],
        }),
      );

      expect(res.status).toBe(200);
      expect(res.data.lines[0]).toMatchObject({
        priceMinor: TIER_MINOR,
        priceBasisPieces: BASIS,
        lineTotalMinor: TIER_MINOR * 2,
      });
      expect(res.data.totalMinor).toBe(TIER_MINOR * 2);
      // A preview writes nothing.
      const order = await get(
        `/admin/orders/${placed.reference}`,
        managerCookie,
      );
      expect(order.data.revisionNumber).toBe(1);
    });

    it('takes the price a manager sets, whatever the catalog says', async () => {
      const placed = await place();

      const res = await adjust(
        placed.reference,
        adjustment({
          lines: [{ ...adjustment().lines[0], priceMinor: 1 }],
        }),
      );

      expect(res.data.totalMinor).toBe(2);
      expect(res.data.lines[0]).toMatchObject({
        priceMinor: 1,
        priceBasisPieces: BASIS,
        lineTotalMinor: 2,
      });
    });

    it('lets staff add a product the storefront does not offer, marked', async () => {
      const placed = await place();
      const line = {
        slug: slugs.hidden,
        units: 1,
        unit: null,
        note: null,
        priceMinor: null,
        priceBasisPieces: null,
      };

      const res = await preview(
        placed.reference,
        adjustment({ lines: [adjustment().lines[0], line] }),
      );

      expect(res.status).toBe(200);
      expect(res.data.lines[1]).toMatchObject({
        slug: slugs.hidden,
        unit: 'piece',
        flags: ['unpublished'],
      });
    });

    it('refuses a slug no product answers to', async () => {
      const placed = await place();

      const res = await adjust(
        placed.reference,
        adjustment({
          lines: [{ ...adjustment().lines[0], slug: `nothing-${SUFFIX}` }],
        }),
      );

      expect(res.status).toBe(400);
      expect(res.data.code).toBe('unknown-product');
    });

    it('holds a manager to the rules the checkout applies', async () => {
      const placed = await place();

      // A company is invoiced, never paid in cash or by card (FR-CART-04).
      const res = await adjust(
        placed.reference,
        adjustment({ paymentMethod: 'cash' }),
      );

      expect(res.status).toBe(400);
      expect(res.data.code).toBe('cash-not-available');
    });

    it('refuses a card arranged on the phone for a company too', async () => {
      const placed = await place();

      // The same rule read the other way: what a company is owed is an
      // invoice, and neither of the two ways a private customer settles up
      // leaves one.
      const res = await adjust(
        placed.reference,
        adjustment({ paymentMethod: 'card-later' }),
      );

      expect(res.status).toBe(400);
      expect(res.data.code).toBe('cash-not-available');
    });

    it('re-derives what the order owes when the method changes', async () => {
      const placed = await place();
      await post(
        `/admin/orders/${placed.reference}/status`,
        { to: 'approved', reason: null, notify: false, markPaid: false },
        managerCookie,
      );

      // Cash is not owed until the handover, so an accepted order switched to
      // it stops being money the shop is waiting for.
      const res = await adjust(
        placed.reference,
        adjustment({
          paymentMethod: 'cash',
          party: party({ name: 'Ada Lovelace', registrationId: null }),
          basedOnRevision: await onRevision(placed.reference),
        }),
      );

      expect(res.data).toMatchObject({
        status: 'approved',
        paymentMethod: 'cash',
        paymentState: 'not-due',
      });
    });

    it('leaves a ready order ready', async () => {
      const placed = await place();
      for (const to of ['approved', 'ready']) {
        await post(
          `/admin/orders/${placed.reference}/status`,
          { to, reason: null, notify: false, markPaid: false },
          managerCookie,
        );
      }

      const res = await adjust(
        placed.reference,
        adjustment({ basedOnRevision: await onRevision(placed.reference) }),
      );

      // Sending it backwards would say the goods are no longer packed.
      expect(res.data.status).toBe('ready');
      // Two moves and the change: the thread is the order's history.
      expect(res.data.revisionNumber).toBe(4);
    });

    /** The platform records what the shop did rather than deciding what it may
     * do — the same argument that made recording a payment undoable. */
    it('changes an order that has ended, without reopening it', async () => {
      const placed = await place();
      await post(
        `/admin/orders/${placed.reference}/status`,
        {
          to: 'declined',
          reason: 'Nothing left',
          notify: false,
          markPaid: false,
        },
        managerCookie,
      );

      const res = await adjust(
        placed.reference,
        adjustment({ basedOnRevision: await onRevision(placed.reference) }),
      );

      expect(res.status).toBe(200);
      expect(res.data.status).toBe('declined');
      expect(res.data.statusReason).toBe('Nothing left');
    });

    /**
     * The two halves of what the customer knows (FR-NOTIF-03), which are not
     * the same fact: their page follows every move the order makes, and their
     * inbox only hears about the moves somebody chose to tell them about.
     */
    it('moves the customer’s view with the order and writes only when asked', async () => {
      const placed = await place();
      for (const to of ['approved', 'ready', 'completed']) {
        await post(
          `/admin/orders/${placed.reference}/status`,
          { to, reason: null, notify: false, markPaid: false },
          managerCookie,
        );
      }

      // Three moves nobody was written about: the order's own page says where
      // it actually is, because a customer waiting for goods that have been
      // handed over must not read "confirmed".
      const quiet = await get(
        `/admin/orders/${placed.reference}`,
        managerCookie,
      );
      expect(quiet.data.revisionNumber).toBe(4);
      expect(quiet.data.customerRevisionNumber).toBe(4);
      // Only the receipt has ever reached them, and that was version 1.
      expect(quiet.data.notifiedRevisionNumber).toBe(1);
      expect(quiet.data.customerBehind).toBe(true);
      const token = await get(`/orders/by-token/${placed.publicToken}`);
      expect(token.data.status).toBe('completed');

      // Until a manager says it is worth telling them, which closes the gap
      // without writing another version.
      const told = await post(
        `/admin/orders/${placed.reference}/notify`,
        {},
        managerCookie,
      );
      expect(told.status).toBe(200);
      expect(told.data.notifiedRevisionNumber).toBe(4);
      expect(told.data.customerBehind).toBe(false);
      // And there is nothing left to tell them a second time.
      expect(
        (
          await post(
            `/admin/orders/${placed.reference}/notify`,
            {},
            managerCookie,
          )
        ).data.code,
      ).toBe('nothing-to-tell');
    });

    /** The move that carries the news says so itself, so the ordinary case is
     * one click and not two. */
    it('records the version a move wrote to the customer about', async () => {
      const placed = await place();

      const res = await post(
        `/admin/orders/${placed.reference}/status`,
        { to: 'approved', reason: null, notify: true, markPaid: false },
        managerCookie,
      );

      expect(res.data.revisionNumber).toBe(2);
      expect(res.data.notifiedRevisionNumber).toBe(2);
      expect(res.data.customerBehind).toBe(false);
      // And the customer's own statuses are what the next confirmation offers
      // its tick against.
      expect(res.data.notifiedStatuses).toEqual(
        expect.arrayContaining(['requested', 'approved']),
      );
    });

    /**
     * The handover of a cash order is one event (FR-ORD-04): completing it and
     * recording the money are one click, and a move that ends an order is
     * refused it — nothing is owed on an order nobody is filling.
     */
    it('records the money with the move that is the handover', async () => {
      const placed = await place({
        party: party({ name: 'Ada Lovelace', registrationId: null }),
        paymentMethod: 'cash',
      });
      for (const to of ['approved', 'ready']) {
        await post(
          `/admin/orders/${placed.reference}/status`,
          { to, reason: null, notify: false, markPaid: false },
          managerCookie,
        );
      }

      const done = await post(
        `/admin/orders/${placed.reference}/status`,
        { to: 'completed', reason: null, notify: false, markPaid: true },
        managerCookie,
      );

      expect(done.data.status).toBe('completed');
      expect(done.data.paymentState).toBe('paid');
      expect(done.data.paidAt).not.toBeNull();
    });

    it('refuses to record money on an order that ends', async () => {
      const placed = await place();

      const res = await post(
        `/admin/orders/${placed.reference}/status`,
        {
          to: 'declined',
          reason: 'Nothing left',
          notify: false,
          markPaid: true,
        },
        managerCookie,
      );

      expect(res.status).toBe(400);
      expect(res.data.code).toBe('payment-not-recordable');
    });

    it('lets one of two managers win, and tells the other', async () => {
      const placed = await place();

      const [first, second] = await Promise.all([
        adjust(placed.reference, adjustment()),
        adjust(placed.reference, adjustment()),
      ]);

      const codes = [first, second].map((res) => res.status).sort();
      expect(codes).toEqual([200, 409]);
      const loser = [first, second].find((res) => res.status === 409);
      expect(loser?.data.code).toBe('order-changed');
    });

    it('keeps every version readable by staff, newest first', async () => {
      const placed = await place();
      await adjust(
        placed.reference,
        adjustment({ lines: [{ ...adjustment().lines[0], units: 5 }] }),
      );

      const res = await get(
        `/admin/orders/${placed.reference}/revisions`,
        managerCookie,
      );

      expect(res.status).toBe(200);
      expect(
        res.data.revisions.map(
          (r: { revisionNumber: number }) => r.revisionNumber,
        ),
      ).toEqual([2, 1]);
      const [current, submitted] = res.data.revisions;
      expect(current).toMatchObject({
        totalMinor: BASE_MINOR * 5,
        note: 'Agreed on the phone',
        changes: ['Agreed on the phone'],
        kind: 'adjustment',
        // Written by whoever was signed in; the submission by nobody.
        author: MANAGER,
        // Nobody has told the customer about it yet.
        customerView: false,
      });
      expect(submitted).toMatchObject({
        totalMinor: BASE_MINOR * 2,
        // The version the customer sent, before the shop had changed anything.
        note: null,
        changes: [],
        kind: 'submitted',
        author: null,
        customerView: true,
      });
      // A superseded version reads exactly like a current one.
      expect(Object.keys(submitted).sort()).toEqual(
        [
          ...ADMIN_DETAIL_KEYS,
          'author',
          'customerView',
          'kind',
          // This version's own change note, beside the order's running account
          // of them: the thread hangs one entry on each row.
          'note',
          'notifiedAt',
          'revisionCreatedAt',
        ].sort(),
      );
    });

    it('serves one version on its own, and nothing for one nobody wrote', async () => {
      const placed = await place();
      await adjust(
        placed.reference,
        adjustment({ lines: [{ ...adjustment().lines[0], units: 5 }] }),
      );

      const res = await get(
        `/admin/orders/${placed.reference}/revisions/1`,
        managerCookie,
      );

      expect(res.status).toBe(200);
      // The version as it was written, not the order as it now stands.
      expect(res.data).toMatchObject({
        revisionNumber: 1,
        kind: 'submitted',
        totalMinor: BASE_MINOR * 2,
      });
      // And the order's own facts, read against the order: the customer is
      // still on the version they were sent.
      expect(res.data.customerRevisionNumber).toBe(1);

      expect(
        (
          await get(
            `/admin/orders/${placed.reference}/revisions/9`,
            managerCookie,
          )
        ).status,
      ).toBe(404);
    });

    it('records which versions the customer was written to about', async () => {
      const placed = await place();

      // The receipt is a message about version 1, so the thread says so from
      // the start: it is the one version nobody has to decide about.
      const submitted = await get(
        `/admin/orders/${placed.reference}/revisions/1`,
        managerCookie,
      );
      expect(submitted.data.notifiedAt).not.toBeNull();

      // A move made without the tick shows the customer where the order got
      // to and tells them nothing.
      await post(
        `/admin/orders/${placed.reference}/status`,
        { to: 'approved', reason: null, notify: false, markPaid: false },
        managerCookie,
      );
      const quiet = await get(
        `/admin/orders/${placed.reference}/revisions/2`,
        managerCookie,
      );
      expect(quiet.data.notifiedAt).toBeNull();
      expect(quiet.data.customerView).toBe(true);

      // And one made with it puts something in their inbox, which the version
      // records — a different question from which version they are on.
      await post(
        `/admin/orders/${placed.reference}/status`,
        { to: 'ready', reason: null, notify: true, markPaid: false },
        managerCookie,
      );
      const told = await get(
        `/admin/orders/${placed.reference}/revisions/3`,
        managerCookie,
      );
      expect(told.data.notifiedAt).not.toBeNull();
      expect(told.data.customerView).toBe(true);
    });

    it('does not offer the versions to the customer', async () => {
      const placed = await place({}, customerCookie);

      expect(
        (
          await get(
            `/admin/orders/${placed.reference}/revisions`,
            customerCookie,
          )
        ).status,
      ).toBe(403);
    });

    it('is not something a customer can do to their own order', async () => {
      const placed = await place({}, customerCookie);

      const res = await adjust(
        placed.reference,
        adjustment({
          lines: [
            {
              ...adjustment().lines[0],
              priceMinor: 1,
            },
          ],
        }),
        customerCookie,
      );

      expect(res.status).toBe(403);
    });
  });

  describe('reading an order back', () => {
    let reference = '';

    beforeAll(async () => {
      const res = await post(
        '/orders',
        submission({ expectedTotalMinor: TIER_MINOR * 2 }),
        customerCookie,
      );
      reference = res.data.reference;
    });

    it('lists the account’s own orders, in exactly the contract shape', async () => {
      const res = await get('/account/orders', customerCookie);

      expect(res.status).toBe(200);
      const mine = res.data.items.find(
        (item: { reference: string }) => item.reference === reference,
      );
      expect(mine).toBeDefined();
      expect(Object.keys(mine).sort()).toEqual(ORDER_SUMMARY_KEYS);
      expect(Object.keys(res.data.pagination).sort()).toEqual([
        'page',
        'pageSize',
        'total',
        'totalPages',
      ]);
    });

    it('reads one of the account’s own orders in exactly the contract shape', async () => {
      const res = await get(`/account/orders/${reference}`, customerCookie);

      expect(res.status).toBe(200);
      expect(Object.keys(res.data).sort()).toEqual(ORDER_DETAIL_KEYS);
      expect(Object.keys(res.data.lines[0]).sort()).toEqual(ORDER_LINE_KEYS);
      expect(Object.keys(res.data.billingAddress).sort()).toEqual([
        'city',
        'country',
        'postalCode',
        'region',
        'street',
        'street2',
      ]);
      // The customer's own order says nothing about how it was priced, nor
      // about the token that would open it without a session.
      const body = JSON.stringify(res.data);
      expect(body).not.toContain('priceBasisPieces');
      expect(body).not.toContain('tierKey');
      expect(body).not.toContain(SOURCE_PREFIX);
      expect(body).not.toContain('publicToken');
    });

    it('refuses an anonymous read of either account route', async () => {
      expect((await get('/account/orders')).status).toBe(401);
      expect((await get(`/account/orders/${reference}`)).status).toBe(401);
    });

    it('answers 404 for a token that opens nothing', async () => {
      const res = await get(`/orders/by-token/not-a-real-token-${SUFFIX}`);

      expect(res.status).toBe(404);
      expect(res.data.code).toBe('order-not-found');
    });

    it('answers 404 — not 403 — for another customer’s order', async () => {
      expect(
        (await get(`/account/orders/${reference}`, otherCookie)).status,
      ).toBe(404);
    });

    it('lets a manager read any order, in basis units', async () => {
      const res = await get(`/admin/orders/${reference}`, managerCookie);

      expect(res.status).toBe(200);
      expect(Object.keys(res.data).sort()).toEqual(ADMIN_DETAIL_KEYS);
      expect(Object.keys(res.data.lines[0]).sort()).toEqual(ADMIN_LINE_KEYS);
      // 2 packs of 10 pieces at a basis of 10: staff read it as 2 × the stored
      // price, which is how the source system quotes it.
      expect(res.data.lines[0]).toMatchObject({
        priceMinor: TIER_MINOR,
        priceBasisPieces: BASIS,
        pieces: 20,
      });
      expect(res.data.customerEmail).toBe(CUSTOMER);
      expect(res.data.tierKey).toBe(TIER_KEY);
    });

    it('lists every order for staff, with who placed it', async () => {
      const res = await get('/admin/orders', managerCookie);

      expect(res.status).toBe(200);
      const found = res.data.items.find(
        (item: { reference: string }) => item.reference === reference,
      );
      expect(Object.keys(found).sort()).toEqual(ADMIN_LIST_KEYS);
      expect(found.customerEmail).toBe(CUSTOMER);
    });

    // Find-an-order: the handful of fields a manager is holding when they look
    // one up, matched by fragment — a reference is read out by its tail as
    // often as whole.
    it('finds an order by a fragment of its reference', async () => {
      const res = await get(
        `/admin/orders?q=${reference.slice(-4)}`,
        managerCookie,
      );

      expect(res.status).toBe(200);
      expect(
        res.data.items.map((item: { reference: string }) => item.reference),
      ).toContain(reference);
    });

    it('finds an order by the account it was placed from', async () => {
      const res = await get(`/admin/orders?q=${CUSTOMER}`, managerCookie);

      expect(res.status).toBe(200);
      expect(res.data.items.length).toBeGreaterThan(0);
      expect(
        res.data.items.every(
          (item: { customerEmail: string | null }) =>
            item.customerEmail === CUSTOMER,
        ),
      ).toBe(true);
    });

    it('answers an unmatched search with an empty page, not an error', async () => {
      const res = await get('/admin/orders?q=zzz-no-such-order', managerCookie);

      expect(res.status).toBe(200);
      expect(res.data.items).toEqual([]);
      expect(res.data.pagination.total).toBe(0);
    });

    it('keeps a customer out of the staff list', async () => {
      expect((await get('/admin/orders', customerCookie)).status).toBe(403);
    });

    it('keeps the order and empties its details when the account is deleted', async () => {
      const res = await post(
        '/account/delete',
        { password: PASSWORD },
        customerCookie,
      );
      expect(res.status).toBe(200);

      // Read off every version of the order, not the current one alone: a
      // superseded revision holds the same name and address.
      const { rows } = await client.query(
        `SELECT r."contactName", r."contactEmail", r."billingCity", r."tierKey",
                r."totalMinor"
           FROM order_revisions r
           JOIN orders o ON o.id = r."orderId"
          WHERE o.reference = $1
          ORDER BY r."revisionNumber"`,
        [reference],
      );
      // Shaped like the thing it replaces, not merely labelled: the order
      // contract validates the contact it reads back, so a placeholder that
      // is not an address makes every anonymized order unchangeable.
      expect(rows[0]).toMatchObject({
        contactName: '[removed]',
        contactEmail: 'removed@deleted.invalid',
        billingCity: '[removed]',
        tierKey: null,
      });
      // The money stays: it is what bookkeeping keeps the order for.
      expect(rows[0].totalMinor).toBe(TIER_MINOR * 2);
      // And the order still belongs to the tombstoned account.
      const { rows: linked } = await client.query(
        'SELECT count(*)::int AS n FROM orders WHERE "userId" = $1',
        [customerId],
      );
      expect(linked[0].n).toBeGreaterThan(0);
    });
  });
});
