import { readFileSync } from 'node:fs';
import { hash } from '@node-rs/argon2';
import axios from 'axios';
import { Client } from 'pg';
import { requireEnv } from '../support/env';
import { JourneyRun } from '../support/journey/journey';
import {
  orderJourneyAdapter,
  OrderJourneyContext,
} from '../journeys/orders.adapter';
import { orderJourneys } from '../journeys/orders.journeys';

/**
 * An order's life, walked end to end (FR-ORD-01…04, FR-NOTIF-03).
 *
 * The rest of `orders.spec.ts` asks whether one move is allowed and what it
 * does. This suite asks what an order looks like after four of them, which is
 * where the facts that only exist in accumulation live: the version each side
 * is on, the statuses the customer has already been written to about, and the
 * mail that therefore does *not* go out the second time round.
 *
 * The journeys themselves are data (`journeys/orders.journeys.ts`) and are also
 * what `docs/order-lifecycle.md` is generated from. Every step asserts the
 * whole observable state, not only the part it declares: a state nobody
 * mentioned is asserted unchanged, and a mail nobody declared fails the step
 * that sent it.
 */

const SUFFIX = Math.random().toString(36).slice(2, 10);
/** One account per journey, not one for the suite: the customer's own panel
 * counts their orders, so two journeys sharing an account would each see the
 * other's. */
const customerEmail = (slug: string) =>
  `e2e-journey-${slug}-${SUFFIX}@example.com`;
const MANAGER = `e2e-journey-manager-${SUFFIX}@example.com`;
const PASSWORD = 'e2e-journey-password';
const SOURCE_PREFIX = `E2E-JOURNEY-${SUFFIX}`;
const SLUG = `e2e-journey-product-${SUFFIX}`;

/** €19.99 per ten pieces, ordered twenty at a time. */
const BASE_MINOR = 1999;
const BASIS = 10;
const PIECES = 20;
const TOTAL_MINOR = (BASE_MINOR * PIECES) / BASIS;

/**
 * The office a collected order is picked up from, read from the deployment's
 * own config rather than named here: a renamed or re-cut office should move
 * this suite, not break it.
 */
const deployment = JSON.parse(
  readFileSync(requireEnv('DEPLOYMENT_CONFIG_FILE'), 'utf8'),
) as { pickup?: { locations: { key: string }[] } };
const PICKUP_KEY = deployment.pickup?.locations[0]?.key ?? null;

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
    ?.find((c) => c.startsWith('session='))
    ?.split(';')[0];
  if (!cookie) throw new Error(`login failed for ${email}: ${res.status}`);
  return cookie;
}

describe('the life of an order', () => {
  let client: Client;
  let passwordHash = '';
  let managerCookie = '';

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
         "sourceId", slug, name, "defaultPriceMinor", "priceBasisPieces",
         "piecesPerPack", "packsPerBox", "minPieceQty", "boxVolume",
         "boxWeight", "boxCount", "categoryId", "lineNoteEnabled",
         "publishedAt")
       VALUES ($1, $2, $3, $4, $5, 10, 4, 10, '0.240', '12.500', 1, $6, true,
               NOW())`,
      [
        `${SOURCE_PREFIX}-product`,
        SLUG,
        `E2E journey ${SUFFIX}`,
        BASE_MINOR,
        BASIS,
        categories[0].id,
      ],
    );

    // Hashed once and reused: argon2 is deliberately slow, and ten accounts
    // hashed separately would be most of this suite's runtime.
    passwordHash = await hash(PASSWORD);
    await client.query(
      `INSERT INTO users (email, "passwordHash", role, status)
       VALUES ($1, $2, 'manager', 'active')`,
      [MANAGER, passwordHash],
    );

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
    await client.query('DELETE FROM categories WHERE "sourceId" = $1', [
      SOURCE_PREFIX.toLowerCase(),
    ]);
    await client.query('DELETE FROM users WHERE email LIKE $1', [
      `e2e-journey-%-${SUFFIX}@example.com`,
    ]);
    await client.end();
  });

  /**
   * The order a journey starts from, placed through the checkout like any
   * other. Its contact address is the journey's own, which is what keeps the
   * mail readings from seeing another suite's messages — Mailpit is shared, and
   * every read here is scoped to this address.
   */
  async function place(
    journey: (typeof orderJourneys)[number],
  ): Promise<OrderJourneyContext> {
    const contactEmail = customerEmail(journey.slug);
    let customerCookie: string | undefined;
    if (!journey.order.asGuest) {
      await client.query(
        `INSERT INTO users (email, "passwordHash", role, status)
         VALUES ($1, $2, 'user', 'active')`,
        [contactEmail, passwordHash],
      );
      customerCookie = await loginAs(contactEmail);
    }
    const company = journey.order.paymentMethod !== 'cash';
    const pickup = journey.order.fulfilment === 'pickup';
    const res = await axios.post(
      '/orders',
      {
        lines: [{ slug: SLUG, unit: 'piece', pieces: PIECES }],
        contact: {
          name: 'Ada Lovelace',
          email: contactEmail,
          phone: '+49 40 7654321',
        },
        fulfilmentMethod: pickup ? 'pickup' : 'delivery',
        party: company
          ? { name: 'Kontor GmbH', registrationId: 'DE123456789' }
          : { name: 'Ada Lovelace', registrationId: null },
        deliveryAddress: pickup ? null : address,
        pickupLocationKey: pickup ? PICKUP_KEY : null,
        billingAddress: address,
        paymentMethod: journey.order.paymentMethod ?? 'bank-transfer',
        preferredDate: null,
        customerNote: null,
        expectedTotalMinor: TOTAL_MINOR,
        acceptPrivacy: true,
      },
      {
        headers: customerCookie ? { Cookie: customerCookie } : {},
        validateStatus: () => true,
      },
    );
    if (res.status !== 201) {
      throw new Error(`could not place the order: ${JSON.stringify(res.data)}`);
    }
    return {
      reference: res.data.reference,
      publicToken: res.data.publicToken,
      contactEmail,
      managerCookie,
      customerCookie,
    };
  }

  describe.each(orderJourneys.map((journey) => [journey.title, journey]))(
    '%s',
    (_title, journey) => {
      let run: JourneyRun<OrderJourneyContext>;

      beforeAll(async () => {
        run = new JourneyRun(orderJourneyAdapter, await place(journey));
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
