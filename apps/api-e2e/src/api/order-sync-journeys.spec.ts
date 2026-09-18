import { hash } from '@node-rs/argon2';
import axios from 'axios';
import { Client } from 'pg';
import { priceProduct } from '../support/catalog-fixture';
import { requireEnv } from '../support/env';
import { JourneyRun } from '../support/journey/journey';
import {
  orderSyncJourneyAdapter,
  OrderSyncJourneyContext,
} from '../journeys/order-sync.adapter';
import { orderSyncJourneys } from '../journeys/order-sync.journeys';

/**
 * The order exchange, walked order by order (FR-ADM-08, FR-ADM-10, FR-ORD-02,
 * FR-ORD-03, FR-ORD-05, FR-NOTIF-09).
 *
 * `machine-order-sync.spec.ts` asks what one instruction is allowed to do —
 * which token reaches the route, what each refusal is called, what a single
 * write-back writes. This suite asks what an *order* looks like after four
 * exchanges: how many versions they left behind, which of them the customer
 * was shown, what arrived in their inbox, and what the shop was told about the
 * connection itself. Order processing is handed over for the length of the
 * suite, so nothing in here could have come from the admin panel.
 *
 * The journeys are data (`journeys/order-sync.journeys.ts`) and are also what
 * `docs/order-sync.md` is generated from. Every step asserts the whole
 * observable state: a reading nobody mentioned is asserted unchanged, and a
 * mail nobody declared fails the step that sent it.
 */

const SUFFIX = Math.random().toString(36).slice(2, 10);
const ADMIN = `e2e-osync-admin-${SUFFIX}@example.com`;
const PASSWORD = 'e2e-osync-password';
const TOKEN_NAME = `e2e order journey ${SUFFIX}`;
const SOURCE_PREFIX = `E2E-OSYNC-${SUFFIX}`;
const PRODUCT_SOURCE_ID = `${SOURCE_PREFIX}-product`;
const SLUG = `e2e-osync-product-${SUFFIX}`;

/** €2.00 a piece, ordered twenty at a time — the same shape the order
 * lifecycle journeys use, so a figure in one document reads like a figure in
 * the other. */
const BASE_MINOR = 200;
const PIECES = 20;
const TOTAL_MINOR = BASE_MINOR * PIECES;

const address = {
  label: null,
  street: 'Hafenstraße 12',
  street2: null,
  postalCode: '20359',
  city: 'Hamburg',
  region: null,
  country: 'DE',
};

async function loginAs(email: string): Promise<string> {
  const res = await axios.post(
    '/auth/login',
    { email, password: PASSWORD },
    { validateStatus: () => true },
  );
  const cookie = (res.headers['set-cookie'] as string[] | undefined)
    ?.find((entry) => entry.startsWith('session='))
    ?.split(';')[0];
  if (!cookie) throw new Error(`login failed for ${email}: ${res.status}`);
  return cookie;
}

describe('the order exchange', () => {
  let client: Client;
  let passwordHash = '';
  let adminCookie = '';
  let token = '';

  const setOrdersOwned = async (owned: boolean) => {
    const res = await axios.put(
      '/settings/ownership',
      { areas: ['orders'], owned },
      { headers: { Cookie: adminCookie }, validateStatus: () => true },
    );
    expect(res.status).toBe(200);
  };

  beforeAll(async () => {
    client = new Client({ connectionString: requireEnv('DATABASE_URL') });
    await client.connect();

    // Its own category, never a borrowed one: products reference a category
    // `ON DELETE restrict`, and other suites hard-delete theirs in teardown.
    const { rows: categories } = await client.query(
      `INSERT INTO categories ("sourceId", slug, name)
       VALUES ($1, $1, $1) RETURNING id`,
      [SOURCE_PREFIX.toLowerCase()],
    );
    await client.query(
      `INSERT INTO products (
         "sourceId", slug, name,
         "piecesPerPack", "packsPerBox", "minPieceQty", "boxVolume",
         "boxWeight", "boxCount", "categoryId", "lineNoteEnabled",
         "publishedAt")
       VALUES ($1, $2, $3, 10, 4, 10, '0.240', '12.500', 1, $4, true, NOW())`,
      [
        PRODUCT_SOURCE_ID,
        SLUG,
        `E2E order exchange ${SUFFIX}`,
        categories[0].id,
      ],
    );
    await priceProduct(client, PRODUCT_SOURCE_ID, BASE_MINOR);

    // Hashed once and reused: argon2 is deliberately slow, and an account per
    // journey hashed separately would be most of this suite's runtime.
    passwordHash = await hash(PASSWORD);
    await client.query(
      `INSERT INTO users (email, "passwordHash", role, status, "passwordSetAt")
       VALUES ($1, $2, 'admin', 'active', now())`,
      [ADMIN, passwordHash],
    );
    adminCookie = await loginAs(ADMIN);

    // Issued through the API rather than inserted: the value is returned once.
    // Both capabilities, which is the shape of an adapter that has gone live —
    // reading is what tells it the version its instruction must answer.
    const issued = await axios.post(
      '/admin/api-tokens',
      { name: TOKEN_NAME, scopes: ['order-read', 'order-sync'] },
      { headers: { Cookie: adminCookie } },
    );
    token = issued.data.token;

    // Every write in this area is refused until somebody hands it over
    // (FR-ADM-10), which is why this suite runs with the file parallelism off
    // like the other two exchanges.
    await setOrdersOwned(true);

    // Where the exchange stands is read off the run before this one, and this
    // database has a history: a leftover failed run would make the journeys'
    // first submission a recovery. One instruction for an order that does not
    // exist normalises that without touching anybody's order — it is filed as
    // a run that refused its only row, which is `ok` as far as the feed's
    // state is concerned. An empty batch would have been tidier, but the
    // contract requires at least one instruction.
    await axios.post(
      '/machine/sync/orders/runs',
      {
        orders: [
          {
            reference: `NO-SUCH-${SUFFIX}`,
            basedOnRevision: 1,
            notify: false,
            showCustomer: false,
          },
        ],
        label: 'journey-baseline',
      },
      { headers: { Authorization: `Bearer ${token}` } },
    );
  });

  afterAll(async () => {
    await setOrdersOwned(false);
    await client.query(
      `DELETE FROM orders WHERE id IN (
         SELECT r."orderId" FROM order_items i
           JOIN order_revisions r ON r.id = i."revisionId"
          WHERE i."productSourceId" LIKE $1)`,
      [`${SOURCE_PREFIX}%`],
    );
    // Runs first: a run points at the credential that submitted it.
    await client.query('DELETE FROM sync_runs WHERE "tokenName" = $1', [
      TOKEN_NAME,
    ]);
    await client.query('DELETE FROM api_tokens WHERE name = $1', [TOKEN_NAME]);
    await client.query('DELETE FROM products WHERE "sourceId" LIKE $1', [
      `${SOURCE_PREFIX}%`,
    ]);
    await client.query('DELETE FROM categories WHERE "sourceId" = $1', [
      SOURCE_PREFIX.toLowerCase(),
    ]);
    await client.query('DELETE FROM users WHERE email LIKE $1', [
      `e2e-osync-%-${SUFFIX}@example.com`,
    ]);
    await client.query('DELETE FROM users WHERE email = $1', [ADMIN]);
    await client.end();
  });

  /**
   * The order a journey starts from, placed at the checkout like any other —
   * which is the point: placing an order stays the customer's own act however
   * the area is owned (FR-ADM-10), so the exchange always has something to
   * answer.
   *
   * One account per journey. The contact address is the journey's own, which
   * is what keeps the mail readings from seeing another journey's messages:
   * Mailpit is shared, and every read here is scoped to that address.
   */
  async function place(
    journey: (typeof orderSyncJourneys)[number],
  ): Promise<OrderSyncJourneyContext> {
    const contactEmail = `e2e-osync-${journey.slug}-${SUFFIX}@example.com`;
    await client.query(
      `INSERT INTO users (email, "passwordHash", role, status, "passwordSetAt")
       VALUES ($1, $2, 'user', 'active', now())`,
      [contactEmail, passwordHash],
    );
    const customerCookie = await loginAs(contactEmail);
    const res = await axios.post(
      '/orders',
      {
        lines: [{ slug: SLUG, unit: 'piece', pieces: PIECES }],
        contact: {
          name: 'Ada Lovelace',
          email: contactEmail,
          phone: '+49 40 7654321',
        },
        fulfilmentMethod: 'delivery',
        party: { name: 'Kontor GmbH', registrationId: 'DE123456789' },
        deliveryAddress: address,
        pickupLocationKey: null,
        billingAddress: address,
        paymentMethod: 'bank-transfer',
        preferredDate: null,
        customerNote: null,
        expectedTotalMinor: TOTAL_MINOR,
        acceptPrivacy: true,
      },
      { headers: { Cookie: customerCookie }, validateStatus: () => true },
    );
    if (res.status !== 201) {
      throw new Error(`could not place the order: ${JSON.stringify(res.data)}`);
    }
    return {
      reference: res.data.reference,
      contactEmail,
      customerCookie,
      adminCookie,
      token,
      productSourceId: PRODUCT_SOURCE_ID,
      basedOnRevision: 1,
    };
  }

  describe.each(orderSyncJourneys.map((journey) => [journey.title, journey]))(
    '%s',
    (_title, journey) => {
      let run: JourneyRun<OrderSyncJourneyContext>;

      beforeAll(async () => {
        run = new JourneyRun(orderSyncJourneyAdapter, await place(journey));
        await run.begin(journey);
      });

      // Sequential by design: each step is asserted against the state the one
      // before it left behind, which is the whole point of a journey.
      it.each(journey.steps.map((step) => [step.what, step]))(
        '%s',
        async (_what, step) => {
          await run.step(step);
        },
      );
    },
  );
});
