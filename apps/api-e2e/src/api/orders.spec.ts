import { hash } from '@node-rs/argon2';
import axios from 'axios';
import { Client } from 'pg';
import { requireEnv } from '../support/env';

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
};

/**
 * The whole contract shape of every order surface. Exhaustive on purpose: a
 * column added to a snapshot later reaches a customer silently, and this is the
 * assertion that stops it — the same guard `catalog.spec.ts` keeps over tiles.
 */
const ORDER_SUMMARY_KEYS = [
  'createdAt',
  'currency',
  'itemCount',
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
  'billingAddress',
  'contact',
  'customerNote',
  'deliveryAddress',
  'deliveryZone',
  'fulfilmentMethod',
  'lines',
  'paymentMethod',
  'pickup',
  'preferredTiming',
  'shipment',
].sort();
/** What staff see on top: the list it was priced from, who placed it, and the
 * lines in basis units (FR-UNIT-04). */
const ADMIN_DETAIL_KEYS = [
  ...ORDER_DETAIL_KEYS,
  'customerEmail',
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
  phone: '+49 40 1234567',
  ...overrides,
});

const submission = (overrides: Record<string, unknown> = {}) => ({
  lines: [{ slug: slugs.boxed, unit: 'pack', quantity: 2 }],
  contact: {
    name: 'Ada Lovelace',
    email: 'ada@example.com',
    phone: '+49 40 7654321',
  },
  fulfilmentMethod: 'delivery',
  deliveryAddress: address(),
  pickupLocationKey: null,
  billingAddress: address(),
  paymentMethod: 'cash',
  preferredTiming: null,
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

    const { rows: categories } = await client.query(
      'SELECT id FROM categories ORDER BY name LIMIT 1',
    );
    const categoryId = categories[0].id;

    // Three products: one on sale, one never published, one soft-deleted. The
    // last two must be indistinguishable from a slug that never existed.
    const product = async (
      slug: string,
      state: 'live' | 'unpublished' | 'deleted',
      lineNoteEnabled = true,
    ) => {
      await client.query(
        `INSERT INTO products (
           "sourceId", slug, name, "defaultPriceMinor", "priceBasisPieces",
           "piecesPerPack", "packsPerBox", "minPieceQty", "boxVolume",
           "boxWeight", "boxCount", "categoryId", "lineNoteEnabled",
           "publishedAt", "deletedAt")
         VALUES ($1, $2, $3, $4, $5, 10, 4, 10, '0.240', '12.500', 1, $6, $7,
                 $8, $9)`,
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
        ],
      );
    };
    await product(slugs.boxed, 'live');
    await product(slugs.hidden, 'unpublished');
    await product(slugs.deleted, 'deleted');
    await product(slugs.noNote, 'live', false);

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
         SELECT "orderId" FROM order_items WHERE "productSourceId" LIKE $1)`,
      [`${SOURCE_PREFIX}%`],
    );
    await client.query('DELETE FROM products WHERE "sourceId" LIKE $1', [
      `${SOURCE_PREFIX}%`,
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
        lines: [{ slug: slugs.boxed, unit: 'pack', quantity: 2 }],
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
        lines: [{ slug: slugs.boxed, unit: 'piece', quantity: 20 }],
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
          { slug: slugs.hidden, unit: 'pack', quantity: 1 },
          { slug: slugs.deleted, unit: 'pack', quantity: 1 },
          { slug: `no-such-product-${SUFFIX}`, unit: 'pack', quantity: 1 },
        ],
      });

      expect(res.status).toBe(200);
      expect(
        res.data.lines.map((line: { issues: string[] }) => line.issues),
      ).toEqual([['unavailable'], ['unavailable'], ['unavailable']]);
      expect(res.data.complete).toBe(false);
    });

    it('corrects a below-minimum piece quantity instead of refusing it', async () => {
      const res = await post('/cart/preview', {
        lines: [{ slug: slugs.boxed, unit: 'piece', quantity: 3 }],
      });

      expect(res.data.lines[0]).toMatchObject({
        quantity: 10,
        issues: ['quantity-corrected'],
        lineTotalMinor: BASE_MINOR,
      });
    });

    it('adds up the shipment estimate across the lines', async () => {
      const res = await post('/cart/preview', {
        lines: [{ slug: slugs.boxed, unit: 'box', quantity: 2 }],
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

    it('refuses a total the browser and the server disagree about', async () => {
      const res = await post(
        '/orders',
        submission({ expectedTotalMinor: BASE_MINOR }),
      );

      expect(res.status).toBe(409);
      expect(res.data.code).toBe('cart-changed');
      // The corrected cart travels with the refusal.
      expect(res.data.preview.totalMinor).toBe(BASE_MINOR * 2);
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
          lines: [{ slug: slugs.hidden, unit: 'pack', quantity: 1 }],
          expectedTotalMinor: 0,
        }),
      );

      expect(res.status).toBe(409);
      expect(res.data.preview.lines[0].issues).toEqual(['unavailable']);
    });

    it('needs the invoiced company for a bank transfer', async () => {
      const res = await post(
        '/orders',
        submission({
          paymentMethod: 'bank-transfer',
          billingAddress: address({ companyName: null, companyId: null }),
        }),
      );

      expect(res.status).toBe(400);
      expect(res.data.code).toBe('billing-details-required');
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
              quantity: 2,
              note: '100 in red',
            },
          ],
        }),
      );

      // An advisory in the preview is still a refusal at submission: the note
      // goes, and the customer sees it go before the order is placed without it.
      expect(res.status).toBe(409);
      expect(res.data.preview.lines[0]).toMatchObject({
        note: null,
        issues: ['note-not-allowed'],
      });
    });

    it('drops a submission whose honeypot is filled', async () => {
      const res = await post(
        '/orders',
        submission({ website: 'http://spam.example' }),
      );

      expect(res.status).toBe(400);
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
        'companyId',
        'companyName',
        'country',
        'phone',
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

      const { rows } = await client.query(
        `SELECT "contactName", "contactEmail", "billingCity", "tierKey", "totalMinor"
           FROM orders WHERE reference = $1`,
        [reference],
      );
      expect(rows[0]).toMatchObject({
        contactName: '[removed]',
        contactEmail: '[removed]',
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
