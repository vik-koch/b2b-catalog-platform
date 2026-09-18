import { hash } from '@node-rs/argon2';
import axios from 'axios';
import { Client } from 'pg';
import { priceProduct } from '../support/catalog-fixture';
import { requireEnv } from '../support/env';

/**
 * The outbound read of orders (FR-ADM-08, first half) end to end.
 *
 * What is worth proving against a real stack is everything the shape of the
 * response alone does not say: that it is its own capability, that it answers
 * whether or not anybody owns order processing — which is the whole point,
 * since a system has to see the orders that are here before it can be handed
 * any of them — that an order names its counterparty by the account's key
 * rather than by the contact its checkout carried, that a guest order says it
 * has no account, that nothing staff-only or customer-only leaks through it,
 * and that the read follows an order as it is worked: a move, a payment and a
 * cancellation all bring it round again with the version it now stands at.
 *
 * Isolation: every order here is placed for this run's own product, and the
 * spec filters what it asserts on down to those — the read is over the shop's
 * whole order book, and the stack has one.
 */

const R = Date.now().toString(36);
const ADMIN_EMAIL = `e2e-order-read-admin-${R}@example.com`;
const MANAGER_EMAIL = `e2e-order-read-manager-${R}@example.com`;
const CUSTOMER_EMAIL = `e2e-order-read-customer-${R}@example.com`;
const PASSWORD = 'e2e-order-read-password';
const TOKEN_NAME = `e2e order read ${R}`;
const SOURCE_PREFIX = `E2E-ORDER-READ-${R}`;
const PRODUCT_SOURCE_ID = `${SOURCE_PREFIX}-boxed`;
const SLUG = `e2e-order-read-boxed-${R}`;
const TIER_KEY = `e2e-order-read-tier-${R}`;
const ACCOUNT_SOURCE_ID = `${SOURCE_PREFIX}-account`;
const PIECE_MINOR = 250;
/** What this suite's tier is charged instead — so the order says which list it
 * was taken from and the figure proves it. */
const TIER_PIECE_MINOR = 100;
/** One pack, which is what every order here is. */
const PIECES = 10;

/** Exhaustive on purpose: a column added to the snapshot later would reach the
 * outside silently, and this is the assertion that stops it. */
const ORDER_KEYS = [
  'billingAddress',
  'contact',
  'createdAt',
  'currency',
  'customer',
  'customerNote',
  'deliveryAddress',
  'fulfilmentMethod',
  'lines',
  'note',
  'paidAt',
  'party',
  'paymentMethod',
  'paymentState',
  'pickup',
  'preferredDate',
  'reference',
  'revisionNumber',
  'status',
  'statusChangedAt',
  'statusReason',
  'cancelledBy',
  'tierKey',
  'totalMinor',
  'updatedAt',
].sort();
const LINE_KEYS = [
  'lineTotalMinor',
  'name',
  'note',
  'pieces',
  'priceMinor',
  'productSourceId',
  'quantity',
  'unit',
].sort();

interface MachineOrder {
  reference: string;
  status: string;
  paymentState: string;
  revisionNumber: number;
  customer: { accountId: string; sourceId: string | null } | null;
  tierKey: string | null;
  cancelledBy: 'customer' | 'shop' | null;
  paidAt: string | null;
  updatedAt: string;
  lines: { productSourceId: string }[];
}

function sessionCookie(setCookie: string[] | undefined): string {
  const cookie = setCookie
    ?.find((c) => c.startsWith('session='))
    ?.split(';')[0];
  if (!cookie) throw new Error('expected a session cookie');
  return cookie;
}

describe('Outbound order read (FR-ADM-08)', () => {
  let client: Client;
  let adminCookie: string;
  let managerCookie: string;
  let customerCookie: string;
  let token: string;
  let customerReadToken: string;
  let accountReference = '';
  let guestReference = '';
  let cancelledReference = '';

  const read = (params: Record<string, string | number> = {}, bearer = token) =>
    axios.get('/machine/orders', {
      params,
      headers: bearer ? { Authorization: `Bearer ${bearer}` } : {},
      validateStatus: () => true,
    });

  const readOne = (reference: string, bearer = token) =>
    axios.get(`/machine/orders/${reference}`, {
      headers: bearer ? { Authorization: `Bearer ${bearer}` } : {},
      validateStatus: () => true,
    });

  /** Only the orders this spec placed: the order book is shared. */
  const mine = (orders: MachineOrder[]) =>
    orders.filter((order) =>
      order.lines.some((line) => line.productSourceId === PRODUCT_SOURCE_ID),
    );

  /** Walks every page so the cursor is exercised rather than assumed. */
  const readAll = async (limit: number) => {
    const all: MachineOrder[] = [];
    let cursor: string | null = null;
    // Bounded so a cursor that never advances fails the test rather than the
    // suite.
    for (let page = 0; page < 200; page++) {
      const res: {
        data: { orders: MachineOrder[]; nextCursor: string | null };
      } = await read(cursor ? { limit, cursor } : { limit });
      all.push(...res.data.orders);
      cursor = res.data.nextCursor;
      if (!cursor) return all;
    }
    throw new Error('the cursor never reached the end of the list');
  };

  const found = async (reference: string) => {
    const order = mine(await readAll(50)).find(
      (o) => o.reference === reference,
    );
    expect(order).toBeDefined();
    return order as MachineOrder;
  };

  const login = async (email: string) => {
    const res = await axios.post('/auth/login', { email, password: PASSWORD });
    return sessionCookie(res.headers['set-cookie']);
  };

  const place = async (over: Record<string, unknown>, cookie?: string) => {
    const res = await axios.post(
      '/orders',
      {
        lines: [{ slug: SLUG, unit: 'pack', pieces: PIECES }],
        contact: {
          name: 'Ada Lovelace',
          email: `contact-${R}@example.com`,
          phone: '+49 40 7654321',
        },
        fulfilmentMethod: 'delivery',
        party: { name: 'Kontor GmbH', registrationId: 'DE123456789' },
        deliveryAddress: {
          label: null,
          street: 'Hafenstraße 12',
          street2: null,
          postalCode: '20359',
          city: 'Hamburg',
          region: null,
          country: 'DE',
        },
        pickupLocationKey: null,
        billingAddress: {
          label: null,
          street: 'Hafenstraße 12',
          street2: null,
          postalCode: '20359',
          city: 'Hamburg',
          region: null,
          country: 'DE',
        },
        paymentMethod: 'bank-transfer',
        preferredDate: null,
        customerNote: null,
        acceptPrivacy: true,
        expectedTotalMinor: (cookie ? TIER_PIECE_MINOR : PIECE_MINOR) * PIECES,
        ...over,
      },
      { headers: cookie ? { Cookie: cookie } : {}, validateStatus: () => true },
    );
    expect(res.status).toBe(201);
    return res.data.reference as string;
  };

  beforeAll(async () => {
    client = new Client({ connectionString: requireEnv('DATABASE_URL') });
    await client.connect();

    // This suite's own category: products reference one `ON DELETE restrict`,
    // and borrowing another suite's breaks its teardown.
    const { rows: categories } = await client.query(
      `INSERT INTO categories ("sourceId", slug, name)
       VALUES ($1, $1, $1) RETURNING id`,
      [SOURCE_PREFIX.toLowerCase()],
    );
    await client.query(
      `INSERT INTO products (
         "sourceId", slug, name, "piecesPerPack", "packsPerBox", "minPieceQty",
         "boxVolume", "boxWeight", "boxCount", "categoryId", "publishedAt")
       VALUES ($1, $2, $3, 10, 4, 10, '0.240', '12.500', 1, $4, now())`,
      [PRODUCT_SOURCE_ID, SLUG, `E2E ${SLUG}`, categories[0].id],
    );
    await priceProduct(client, PRODUCT_SOURCE_ID, PIECE_MINOR);

    const { rows: tiers } = await client.query(
      'INSERT INTO customer_tiers (key, label) VALUES ($1, $2) RETURNING id',
      [TIER_KEY, 'E2E Order Read'],
    );
    // The tier's own price for this product: without a row of its own a
    // tiered customer is priced from the default list, and the `tierKey` on
    // the order would prove nothing.
    await client.query(
      `INSERT INTO product_prices ("productId", "tierId", "priceMinor")
       SELECT id, $1, $2 FROM products WHERE "sourceId" = $3`,
      [tiers[0].id, TIER_PIECE_MINOR, PRODUCT_SOURCE_ID],
    );

    const passwordHash = await hash(PASSWORD);
    await client.query(
      `INSERT INTO users (email, "passwordHash", role, status, "tierId", "sourceId")
       VALUES ($1, $2, 'user', 'active', $3, $4)`,
      [CUSTOMER_EMAIL, passwordHash, tiers[0].id, ACCOUNT_SOURCE_ID],
    );
    await client.query(
      `INSERT INTO users (email, "passwordHash", role, status)
       VALUES ($1, $2, 'admin', 'active'), ($3, $2, 'manager', 'active')`,
      [ADMIN_EMAIL, passwordHash, MANAGER_EMAIL],
    );

    adminCookie = await login(ADMIN_EMAIL);
    managerCookie = await login(MANAGER_EMAIL);
    customerCookie = await login(CUSTOMER_EMAIL);

    const issued = await axios.post(
      '/admin/api-tokens',
      { name: TOKEN_NAME, scopes: ['order-read'] },
      { headers: { Cookie: adminCookie } },
    );
    token = issued.data.token;
    const other = await axios.post(
      '/admin/api-tokens',
      { name: `${TOKEN_NAME} customers`, scopes: ['customer-read'] },
      { headers: { Cookie: adminCookie } },
    );
    customerReadToken = other.data.token;

    accountReference = await place({}, customerCookie);
    guestReference = await place({});
    cancelledReference = await place({}, customerCookie);
  });

  afterAll(async () => {
    await client.query('DELETE FROM api_tokens WHERE name LIKE $1', [
      `${TOKEN_NAME}%`,
    ]);
    // Before the accounts: an order points at the user that placed it with no
    // action on delete, because accounts are anonymized rather than removed.
    await client.query(
      `DELETE FROM orders WHERE id IN (
         SELECT r."orderId" FROM order_items i
           JOIN order_revisions r ON r.id = i."revisionId"
          WHERE i."productSourceId" = $1)`,
      [PRODUCT_SOURCE_ID],
    );
    await client.query('DELETE FROM products WHERE "sourceId" = $1', [
      PRODUCT_SOURCE_ID,
    ]);
    await client.query('DELETE FROM categories WHERE "sourceId" = $1', [
      SOURCE_PREFIX.toLowerCase(),
    ]);
    await client.query('DELETE FROM users WHERE email = ANY($1)', [
      [ADMIN_EMAIL, MANAGER_EMAIL, CUSTOMER_EMAIL],
    ]);
    await client.query('DELETE FROM customer_tiers WHERE key = $1', [TIER_KEY]);
    await client.end();
  });

  describe('who may reach it', () => {
    it('refuses a request with no credential', async () => {
      expect((await read({}, '')).status).toBe(401);
    });

    /** Its own capability, and that is the point of it: reading what the shop
     * has sold and writing to live orders are different powers. */
    it('refuses a token allowed something else', async () => {
      const res = await read({}, customerReadToken);
      expect(res.status).toBe(403);
      expect(res.data.code).toBe('insufficient-scope');
    });

    it('refuses an admin session on the machine route', async () => {
      const res = await axios.get('/machine/orders', {
        headers: { Cookie: adminCookie },
        validateStatus: () => true,
      });
      expect(res.status).toBe(401);
    });

    /**
     * The read is ungated either way, and both halves matter: before the
     * hand-over because that is when a system has to learn what is here, and
     * after it because that is when it is doing the work.
     */
    it('answers whether or not order processing is owned', async () => {
      expect((await read()).status).toBe(200);

      const owned = await axios.put(
        '/settings/ownership',
        { areas: ['orders'], owned: true },
        { headers: { Cookie: adminCookie }, validateStatus: () => true },
      );
      expect(owned.status).toBe(200);
      try {
        const res = await read();
        expect(res.status).toBe(200);
        expect(mine(res.data.orders).length).toBeGreaterThan(0);
      } finally {
        // Asserted, not merely attempted: a restore that failed silently
        // leaves every later file in this serial suite refused.
        const back = await axios.put(
          '/settings/ownership',
          { areas: ['orders'], owned: false },
          { headers: { Cookie: adminCookie }, validateStatus: () => true },
        );
        expect(back.status).toBe(200);
      }
    });
  });

  describe('what an order carries', () => {
    it('names the counterparty by the account, not by the checkout', async () => {
      const order = await found(accountReference);

      // The contact on the order is a colleague's; what identifies the
      // customer is the account's own key (FR-ADM-14).
      expect(order.customer).toEqual({
        accountId: expect.any(String),
        sourceId: ACCOUNT_SOURCE_ID,
      });
      expect(order.tierKey).toBe(TIER_KEY);
    });

    it('says a guest order has no account at all', async () => {
      const order = await found(guestReference);
      expect(order.customer).toBeNull();
    });

    it('carries the order and nothing else', async () => {
      const order = await found(accountReference);

      expect(Object.keys(order).sort()).toEqual(ORDER_KEYS);
      // Not the guest's mailed link, not the shipment estimate, not the
      // version the customer happens to be looking at.
      expect(order).not.toHaveProperty('publicToken');
      expect(order).not.toHaveProperty('shipment');
      expect(order).not.toHaveProperty('customerRevisionNumber');
    });

    it('names each line by the source system’s own product key', async () => {
      const order = await found(accountReference);
      const [line] = order.lines;

      expect(Object.keys(line).sort()).toEqual(LINE_KEYS);
      expect(line).toMatchObject({
        productSourceId: PRODUCT_SOURCE_ID,
        // The piece count is the quantity; `pack` and `1` are the reading it
        // was bought through (FR-UNIT-11).
        pieces: PIECES,
        unit: 'pack',
        quantity: 1,
        priceMinor: TIER_PIECE_MINOR,
        lineTotalMinor: TIER_PIECE_MINOR * PIECES,
      });
      // The storefront slug is a URL the shop may rename, and no article
      // number exists to quote instead.
      expect(line).not.toHaveProperty('slug');
    });
  });

  describe('following an order as it is worked', () => {
    it('reads the version the order now stands at, after a move', async () => {
      const before = await found(accountReference);
      expect(before.status).toBe('requested');
      expect(before.revisionNumber).toBe(1);

      const moved = await axios.post(
        `/admin/orders/${accountReference}/status`,
        {
          to: 'approved',
          reason: null,
          notify: false,
          markPaid: false,
          showCustomer: true,
        },
        { headers: { Cookie: managerCookie }, validateStatus: () => true },
      );
      expect(moved.status).toBe(200);

      const after = await found(accountReference);
      expect(after.status).toBe('approved');
      // A move writes a version, and naming it is what a write-back answers.
      expect(after.revisionNumber).toBe(2);
      expect(after.updatedAt > before.updatedAt).toBe(true);
    });

    it('reports the money as a second fact about the order', async () => {
      const before = await found(accountReference);
      expect(before.paidAt).toBeNull();

      const paid = await axios.post(
        `/admin/orders/${accountReference}/payment`,
        { paid: true },
        { headers: { Cookie: managerCookie }, validateStatus: () => true },
      );
      expect(paid.status).toBe(200);

      const after = await found(accountReference);
      expect(after.paymentState).toBe('paid');
      expect(after.paidAt).not.toBeNull();
      // Recording a payment writes no version, and the order still has to come
      // round again for anybody outside to hear about it.
      expect(after.revisionNumber).toBe(before.revisionNumber);
      expect(after.updatedAt > before.updatedAt).toBe(true);
    });

    /**
     * The one thing the customer may still do however orders are owned
     * (FR-ADM-10), and therefore the one a write-back has to be able to see
     * coming (FR-ADM-08).
     */
    it('shows an order the customer called off', async () => {
      const cancelled = await axios.post(
        `/account/orders/${cancelledReference}/cancel`,
        { reason: 'Ordered twice by mistake' },
        { headers: { Cookie: customerCookie }, validateStatus: () => true },
      );
      expect(cancelled.status).toBe(200);

      const order = await found(cancelledReference);
      expect(order.status).toBe('cancelled');
      expect(order).toMatchObject({
        statusReason: 'Ordered twice by mistake',
        // The distinction a write-back turns on: this one is protected from
        // every writer, and the shop's own cancellation is not.
        cancelledBy: 'customer',
      });
    });

    /** Every other order says nothing, including a refused one: a decline is
     * always the shop's, and `statusReason` is the whole of what to read. */
    it('says nothing about who cancelled an order nobody cancelled', async () => {
      expect((await found(accountReference)).cancelledBy).toBeNull();
    });
  });

  describe('one order by reference', () => {
    it('answers the order as the list does', async () => {
      const res = await readOne(accountReference);
      expect(res.status).toBe(200);
      expect(res.data).toEqual(await found(accountReference));
    });

    it('says nothing about a reference it does not have', async () => {
      const res = await readOne(`${SOURCE_PREFIX}-nothing`);
      expect(res.status).toBe(404);
      expect(res.data.code).toBe('order-not-found');
    });

    it('refuses a token allowed something else', async () => {
      const res = await readOne(accountReference, customerReadToken);
      expect(res.status).toBe(403);
    });
  });

  describe('paging', () => {
    it('walks the whole list one small page at a time, without repeats', async () => {
      const wholeList = mine(await readAll(50));
      const inPieces = mine(await readAll(1));

      expect(inPieces.map((o) => o.reference)).toEqual(
        wholeList.map((o) => o.reference),
      );
      expect(new Set(inPieces.map((o) => o.reference)).size).toBe(
        inPieces.length,
      );
    });

    it('reads only what has moved since a moment', async () => {
      const all = await readAll(50);
      const last = all.at(-1);
      expect(last).toBeDefined();

      const res = await read({ since: last?.updatedAt ?? '', limit: 50 });
      expect(res.status).toBe(200);
      // Inclusive, so the order it names is in the answer — and nothing older
      // than it is, which is the property a scheduled puller relies on.
      const back: MachineOrder[] = res.data.orders;
      expect(back.some((o) => o.reference === last?.reference)).toBe(true);
      expect(back.every((o) => o.updatedAt >= (last?.updatedAt ?? ''))).toBe(
        true,
      );
    });

    it('refuses a cursor it did not issue', async () => {
      const res = await read({ cursor: 'not-a-cursor' });
      expect(res.status).toBe(400);
      expect(res.data.code).toBe('invalid-cursor');
    });
  });
});
