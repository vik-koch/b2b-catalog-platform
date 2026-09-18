import { hash } from '@node-rs/argon2';
import axios from 'axios';
import { Client } from 'pg';
import { priceProduct } from '../support/catalog-fixture';
import { requireEnv } from '../support/env';

/**
 * The order write-back (FR-ADM-08, ADR 0062) end to end.
 *
 * What is worth proving against a real stack is everything the shape of the
 * request does not say: that it is refused until somebody hands order
 * processing over, that one instruction carrying a move, a change and a
 * payment writes exactly **one** version of the order, that re-sending it
 * writes none at all, that an order the customer called off is refused rather
 * than driven forward, that one bad instruction does not cost the good ones in
 * the same batch, and that the version carries the name of whoever acted over
 * there without that name ever becoming an account here.
 */

const R = Date.now().toString(36);
const ADMIN_EMAIL = `e2e-order-sync-admin-${R}@example.com`;
const MANAGER_EMAIL = `e2e-order-sync-manager-${R}@example.com`;
const CUSTOMER_EMAIL = `e2e-order-sync-customer-${R}@example.com`;
const PASSWORD = 'e2e-order-sync-password';
const TOKEN_NAME = `e2e order sync ${R}`;
const SOURCE_PREFIX = `E2E-ORDER-SYNC-${R}`;
const PRODUCT_A = `${SOURCE_PREFIX}-a`;
const PRODUCT_B = `${SOURCE_PREFIX}-b`;
const SLUG_A = `e2e-order-sync-a-${R}`;
const SLUG_B = `e2e-order-sync-b-${R}`;
const PIECE_MINOR = 200;
const PIECES = 10;
/** What the owning system calls whoever answered the order over there. */
const ACTOR = 'Отдел продаж / И. Петров';

interface WriteResult {
  reference: string;
  kind: string;
  status: string;
  paymentState: string;
  revisionNumber: number;
  notified: boolean;
  noteIgnored: boolean;
}
interface RowError {
  row: number;
  reference: string | null;
  code: string;
  params?: Record<string, string>;
}
interface RunResponse {
  run: { id: string; status: string; area: string; summary: unknown };
  plan: {
    summary: { update: number; unchanged: number; errors: number };
    orders: WriteResult[];
    rowErrors: RowError[];
  };
}

function sessionCookie(setCookie: string[] | undefined): string {
  const cookie = setCookie
    ?.find((c) => c.startsWith('session='))
    ?.split(';')[0];
  if (!cookie) throw new Error('expected a session cookie');
  return cookie;
}

describe('Order write-back (FR-ADM-08)', () => {
  let client: Client;
  let adminCookie: string;
  let managerCookie: string;
  let customerCookie: string;
  let token: string;
  let readToken: string;

  const write = (body: unknown, bearer = token) =>
    axios.post('/machine/sync/orders/runs', body, {
      headers: bearer ? { Authorization: `Bearer ${bearer}` } : {},
      validateStatus: () => true,
    });

  const readOrder = (reference: string) =>
    axios.get(`/machine/orders/${reference}`, {
      headers: { Authorization: `Bearer ${readToken}` },
      validateStatus: () => true,
    });

  const asAdmin = (
    method: 'get' | 'put' | 'post',
    url: string,
    data?: unknown,
  ) =>
    axios.request({
      method,
      url,
      data,
      headers: { Cookie: adminCookie },
      validateStatus: () => true,
    });

  const setOwned = async (owned: boolean) => {
    const res = await asAdmin('put', '/settings/ownership', {
      areas: ['orders'],
      owned,
    });
    expect(res.status).toBe(200);
  };

  const login = async (email: string) => {
    const res = await axios.post('/auth/login', { email, password: PASSWORD });
    return sessionCookie(res.headers['set-cookie']);
  };

  const address = {
    label: null,
    street: 'Hafenstraße 12',
    street2: null,
    postalCode: '20359',
    city: 'Hamburg',
    region: null,
    country: 'DE',
  };

  const place = async (cookie?: string) => {
    const res = await axios.post(
      '/orders',
      {
        lines: [{ slug: SLUG_A, unit: 'pack', pieces: PIECES }],
        contact: {
          name: 'Ada Lovelace',
          email: `contact-${R}@example.com`,
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
        acceptPrivacy: true,
        expectedTotalMinor: PIECE_MINOR * PIECES,
      },
      { headers: cookie ? { Cookie: cookie } : {}, validateStatus: () => true },
    );
    expect(res.status).toBe(201);
    return res.data.reference as string;
  };

  /** One instruction, with the two flags every write-back has to answer. */
  const instruction = (over: Record<string, unknown>) => ({
    notify: false,
    showCustomer: true,
    ...over,
  });

  const revisionOf = async (reference: string) => {
    const res = await readOrder(reference);
    expect(res.status).toBe(200);
    return res.data as { revisionNumber: number; status: string };
  };

  beforeAll(async () => {
    client = new Client({ connectionString: requireEnv('DATABASE_URL') });
    await client.connect();

    const { rows: categories } = await client.query(
      `INSERT INTO categories ("sourceId", slug, name)
       VALUES ($1, $1, $1) RETURNING id`,
      [SOURCE_PREFIX.toLowerCase()],
    );
    for (const [sourceId, slug] of [
      [PRODUCT_A, SLUG_A],
      [PRODUCT_B, SLUG_B],
    ]) {
      await client.query(
        `INSERT INTO products (
           "sourceId", slug, name, "piecesPerPack", "packsPerBox", "minPieceQty",
           "boxVolume", "boxWeight", "boxCount", "categoryId", "publishedAt")
         VALUES ($1, $2, $3, 10, 4, 10, '0.240', '12.500', 1, $4, now())`,
        [sourceId, slug, `E2E ${slug}`, categories[0].id],
      );
      await priceProduct(client, sourceId, PIECE_MINOR);
    }

    const passwordHash = await hash(PASSWORD);
    await client.query(
      `INSERT INTO users (email, "passwordHash", role, status)
       VALUES ($1, $2, 'user', 'active'), ($3, $2, 'admin', 'active'),
              ($4, $2, 'manager', 'active')`,
      [CUSTOMER_EMAIL, passwordHash, ADMIN_EMAIL, MANAGER_EMAIL],
    );

    adminCookie = await login(ADMIN_EMAIL);
    managerCookie = await login(MANAGER_EMAIL);
    customerCookie = await login(CUSTOMER_EMAIL);

    const issued = await asAdmin('post', '/admin/api-tokens', {
      name: TOKEN_NAME,
      scopes: ['order-sync'],
    });
    token = issued.data.token;
    const reader = await asAdmin('post', '/admin/api-tokens', {
      name: `${TOKEN_NAME} read`,
      scopes: ['order-read'],
    });
    readToken = reader.data.token;
  });

  afterAll(async () => {
    // Whatever a failing case left behind: the area is the shop's again.
    await asAdmin('put', '/settings/ownership', {
      areas: ['orders'],
      owned: false,
    });
    // The runs first: each points at the credential that submitted it, which
    // is the whole reason a revoked token's row is kept.
    await client.query('DELETE FROM sync_runs WHERE "tokenName" LIKE $1', [
      `${TOKEN_NAME}%`,
    ]);
    await client.query('DELETE FROM api_tokens WHERE name LIKE $1', [
      `${TOKEN_NAME}%`,
    ]);
    // Before the accounts: an order points at the user that placed it with no
    // action on delete.
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
    await client.query('DELETE FROM users WHERE email = ANY($1)', [
      [ADMIN_EMAIL, MANAGER_EMAIL, CUSTOMER_EMAIL],
    ]);
    await client.end();
  });

  describe('who may reach it', () => {
    it('refuses a request with no credential', async () => {
      expect((await write({ orders: [] }, '')).status).toBe(401);
    });

    /** Reading orders and answering them are different powers, and a
     * credential brought up on the first does not acquire the second. */
    it('refuses an order-read token', async () => {
      const res = await write({ orders: [] }, readToken);
      expect(res.status).toBe(403);
      expect(res.data.code).toBe('insufficient-scope');
    });

    /** The mirror of the refusal the admin panel meets while the area *is*
     * owned: two writers is the thing FR-ADM-10 exists to prevent. */
    it('refuses while nobody has handed order processing over', async () => {
      const reference = await place();
      const res = await write({
        orders: [instruction({ reference, basedOnRevision: 1 })],
      });

      expect(res.status).toBe(409);
      expect(res.data.code).toBe('orders-not-externally-owned');
    });
  });

  describe('while order processing is externally owned', () => {
    beforeAll(() => setOwned(true));
    afterAll(() => setOwned(false));

    it('moves an order and writes one version for it', async () => {
      const reference = await place();

      const res = await write({
        label: `run ${R}`,
        actor: ACTOR,
        orders: [
          instruction({ reference, basedOnRevision: 1, status: 'approved' }),
        ],
      });

      expect(res.status).toBe(201);
      const body = res.data as RunResponse;
      expect(body.run).toMatchObject({ status: 'applied', area: 'orders' });
      expect(body.plan.summary).toMatchObject({ update: 1, errors: 0 });
      expect(body.plan.orders[0]).toMatchObject({
        reference,
        kind: 'transition',
        status: 'approved',
        revisionNumber: 2,
      });
      expect(await revisionOf(reference)).toMatchObject({
        status: 'approved',
        revisionNumber: 2,
      });
    });

    /** The ordinary behaviour of a source that cannot remember what it sent
     * (FR-ADM-16). It must not lengthen the thread, and it must not mail. */
    it('writes nothing for an instruction the order already answers', async () => {
      const reference = await place();
      await write({
        orders: [
          instruction({ reference, basedOnRevision: 1, status: 'approved' }),
        ],
      });

      const again = await write({
        orders: [
          instruction({ reference, basedOnRevision: 2, status: 'approved' }),
        ],
      });

      const body = again.data as RunResponse;
      expect(body.run.status).toBe('no-change');
      expect(body.plan.summary).toMatchObject({ update: 0, unchanged: 1 });
      expect(body.plan.orders[0]).toMatchObject({
        kind: 'unchanged',
        revisionNumber: 2,
      });
      expect((await revisionOf(reference)).revisionNumber).toBe(2);
    });

    it('rewrites the lines by the source system’s own product keys', async () => {
      const reference = await place();

      const res = await write({
        orders: [
          instruction({
            reference,
            basedOnRevision: 1,
            note: 'Two packs short; one swapped',
            lines: [
              { productSourceId: PRODUCT_A, pieces: 5 },
              { productSourceId: PRODUCT_B, pieces: 10, priceMinor: 150 },
            ],
          }),
        ],
      });

      expect((res.data as RunResponse).plan.orders[0]).toMatchObject({
        kind: 'adjustment',
        revisionNumber: 2,
      });
      const after = await readOrder(reference);
      expect(after.data.lines).toEqual([
        expect.objectContaining({ productSourceId: PRODUCT_A, pieces: 5 }),
        expect.objectContaining({
          productSourceId: PRODUCT_B,
          pieces: 10,
          priceMinor: 150,
        }),
      ]);
      expect(after.data.totalMinor).toBe(5 * PIECE_MINOR + 10 * 150);
    });

    /**
     * The whole reason the instruction carries all three: an order accepted,
     * re-priced and paid between two polls is one thing that happened to it.
     */
    it('writes one version for a move, a change and a payment together', async () => {
      const reference = await place();

      const res = await write({
        actor: ACTOR,
        orders: [
          instruction({
            reference,
            basedOnRevision: 1,
            status: 'approved',
            paid: true,
            lines: [{ productSourceId: PRODUCT_A, pieces: 8 }],
          }),
        ],
      });

      expect((res.data as RunResponse).plan.orders[0]).toMatchObject({
        kind: 'adjustment',
        status: 'approved',
        paymentState: 'paid',
        // One version, not three.
        revisionNumber: 2,
      });
      const after = await readOrder(reference);
      expect(after.data.paidAt).not.toBeNull();
    });

    /** Recording the money is a fact about the order, not a reading of it —
     * so it writes no version, exactly as a manager's tick does not. */
    it('records a payment without writing a version', async () => {
      const reference = await place();
      await write({
        orders: [
          instruction({ reference, basedOnRevision: 1, status: 'approved' }),
        ],
      });

      const res = await write({
        orders: [instruction({ reference, basedOnRevision: 2, paid: true })],
      });

      expect((res.data as RunResponse).plan.orders[0]).toMatchObject({
        kind: 'payment',
        paymentState: 'paid',
        revisionNumber: 2,
      });
    });

    it('carries the name of whoever acted over there, and resolves it to nobody', async () => {
      const reference = await place();
      await write({
        actor: ACTOR,
        orders: [
          instruction({ reference, basedOnRevision: 1, status: 'approved' }),
        ],
      });

      const thread = await asAdmin(
        'get',
        `/admin/orders/${reference}/revisions`,
      );
      const [latest] = thread.data.revisions.filter(
        (revision: { revisionNumber: number }) => revision.revisionNumber === 2,
      );
      expect(latest).toMatchObject({ source: ACTOR, author: null });
      // An opaque label: nothing here went looking for an account to blame it
      // on, and no account carries that name.
      const { rows } = await client.query(
        'SELECT 1 FROM users WHERE email = $1',
        [ACTOR],
      );
      expect(rows).toHaveLength(0);
    });

    describe('what it refuses', () => {
      it('refuses an instruction written against a version the order has left', async () => {
        const reference = await place();
        await write({
          orders: [
            instruction({ reference, basedOnRevision: 1, status: 'approved' }),
          ],
        });

        const stale = await write({
          orders: [
            instruction({ reference, basedOnRevision: 1, status: 'ready' }),
          ],
        });

        const body = stale.data as RunResponse;
        expect(body.plan.rowErrors[0]).toMatchObject({
          row: 1,
          code: 'order-changed',
          params: { current: '2' },
        });
        expect(body.plan.summary.update).toBe(0);
      });

      /** The customer may call off an unanswered order however the area is
       * owned (FR-ADM-10), so the exchange meets it and is refused by it. */
      it('refuses an order the customer called off', async () => {
        const reference = await place(customerCookie);
        const cancelled = await axios.post(
          `/account/orders/${reference}/cancel`,
          { reason: 'Ordered twice by mistake' },
          { headers: { Cookie: customerCookie }, validateStatus: () => true },
        );
        expect(cancelled.status).toBe(200);

        const res = await write({
          orders: [
            instruction({ reference, basedOnRevision: 2, status: 'approved' }),
          ],
        });

        expect((res.data as RunResponse).plan.rowErrors[0]).toMatchObject({
          code: 'order-called-off',
        });
        // And the read says which cancellation it was, so an adapter does not
        // have to find out by being refused.
        expect((await readOrder(reference)).data).toMatchObject({
          cancelledBy: 'customer',
        });
      });

      /** The machine row of the transition table, where it actually matters:
       * an order accepted and packed between two polls is one report. */
      it('takes an order straight to where the owning system says it is', async () => {
        const reference = await place();

        const res = await write({
          orders: [
            instruction({ reference, basedOnRevision: 1, status: 'ready' }),
          ],
        });

        const body = res.data as RunResponse;
        expect(body.plan.rowErrors).toEqual([]);
        expect(body.plan.orders[0]).toMatchObject({
          kind: 'transition',
          status: 'ready',
          // One report, one version — not one per state it passed through.
          revisionNumber: 2,
        });
        expect(await revisionOf(reference)).toMatchObject({
          status: 'ready',
          revisionNumber: 2,
        });
      });

      /** Declining is a refusal *before* acceptance, so an order being worked
       * is stopped with `cancelled` and not with this. */
      it('refuses to decline an order that is already being worked', async () => {
        const reference = await place();
        await write({
          orders: [
            instruction({ reference, basedOnRevision: 1, status: 'approved' }),
          ],
        });

        const res = await write({
          orders: [
            instruction({
              reference,
              basedOnRevision: 2,
              status: 'declined',
              statusReason: 'Out of stock until March.',
            }),
          ],
        });

        expect((res.data as RunResponse).plan.rowErrors[0]).toMatchObject({
          code: 'transition-not-allowed',
        });
      });

      /**
       * The other half of `order-called-off`. While the area is owned the
       * panel refuses every move, so an order the exchange cancelled by
       * mistake would be stuck for good if this were refused too.
       */
      it('reopens an order it cancelled itself', async () => {
        const reference = await place();
        const off = await write({
          orders: [
            instruction({
              reference,
              basedOnRevision: 1,
              status: 'cancelled',
              statusReason: 'Duplicate of 2026-000430.',
            }),
          ],
        });
        expect((off.data as RunResponse).plan.rowErrors).toEqual([]);
        const cancelled = await readOrder(reference);
        expect(cancelled.data).toMatchObject({
          status: 'cancelled',
          cancelledBy: 'shop',
        });

        const back = await write({
          orders: [
            instruction({ reference, basedOnRevision: 2, status: 'requested' }),
          ],
        });

        expect((back.data as RunResponse).plan.rowErrors).toEqual([]);
        expect(await revisionOf(reference)).toMatchObject({
          status: 'requested',
          revisionNumber: 3,
        });
      });

      /**
       * A note rides on a version, so the answers that write none have to say
       * the note went nowhere — by what the instruction *did*, never by which
       * fields it named. Reported and not refused: a source re-sending its
       * whole snapshot carries the same note every cycle.
       */
      it('says when a note was dropped, and when it was carried', async () => {
        const reference = await place();
        const first = instruction({
          reference,
          basedOnRevision: 1,
          status: 'approved',
          note: 'Half now, half in March.',
        });

        // Carried: this instruction writes a version.
        const applied = await write({ orders: [first] });
        expect((applied.data as RunResponse).plan.orders[0]).toMatchObject({
          kind: 'transition',
          noteIgnored: false,
        });

        // Dropped, but not refused: the same snapshot again changes nothing,
        // and its note was delivered by the version above.
        const again = await write({
          orders: [{ ...first, basedOnRevision: 2 }],
        });
        const body = again.data as RunResponse;
        expect(body.plan.rowErrors).toEqual([]);
        expect(body.plan.orders[0]).toMatchObject({
          kind: 'unchanged',
          revisionNumber: 2,
          noteIgnored: true,
        });
      });

      /** The case a field-presence rule would have got wrong in both
       * directions: money writes no version, so a note beside it is dropped
       * even though `paid` was named. */
      it('drops a note sent beside a payment, and says so', async () => {
        const reference = await place();
        await write({
          orders: [
            instruction({ reference, basedOnRevision: 1, status: 'approved' }),
          ],
        });

        const res = await write({
          orders: [
            instruction({
              reference,
              basedOnRevision: 2,
              paid: true,
              note: 'Paid by transfer, ref 88120.',
            }),
          ],
        });

        expect((res.data as RunResponse).plan.orders[0]).toMatchObject({
          kind: 'payment',
          paymentState: 'paid',
          // Recording money writes no version — and the revision does not move,
          // which is why a payment retry is idempotent rather than refused.
          revisionNumber: 2,
          noteIgnored: true,
        });
      });

      /** The other half of the skipped-transition change: the payment axis has
       * to land where the *state* says, not where the move says. */
      it('makes an invoiced order due when the move skipped acceptance', async () => {
        const reference = await place();

        const res = await write({
          orders: [
            instruction({ reference, basedOnRevision: 1, status: 'completed' }),
          ],
        });

        expect((res.data as RunResponse).plan.orders[0]).toMatchObject({
          status: 'completed',
          // Never approved by a transition, but an invoiced order that has been
          // handed over is owed money all the same.
          paymentState: 'awaiting',
        });
      });

      /**
       * A recorded payment is an observation about the world, not a figure
       * derived from where the order stands: walking a mistaken completion
       * back must not un-receive the money.
       */
      it('keeps a recorded payment through a backward correction', async () => {
        const reference = await place();
        await write({
          orders: [
            instruction({
              reference,
              basedOnRevision: 1,
              status: 'completed',
              paid: true,
            }),
          ],
        });
        expect((await readOrder(reference)).data).toMatchObject({
          status: 'completed',
          paymentState: 'paid',
        });

        // Completed by mistake — walked back, with the money left alone.
        const back = await write({
          orders: [
            instruction({ reference, basedOnRevision: 2, status: 'approved' }),
          ],
        });

        expect((back.data as RunResponse).plan.orders[0]).toMatchObject({
          kind: 'transition',
          status: 'approved',
          paymentState: 'paid',
        });
        expect((await readOrder(reference)).data).toMatchObject({
          paymentState: 'paid',
        });
      });

      /** Reopening straight to where the order actually got to over there. */
      it('reopens a refused order to the state it reached elsewhere', async () => {
        const reference = await place();
        await write({
          orders: [
            instruction({
              reference,
              basedOnRevision: 1,
              status: 'declined',
              statusReason: 'Out of stock until March.',
            }),
          ],
        });

        const back = await write({
          orders: [
            instruction({ reference, basedOnRevision: 2, status: 'approved' }),
          ],
        });

        expect((back.data as RunResponse).plan.rowErrors).toEqual([]);
        const order = (await readOrder(reference)).data;
        expect(order).toMatchObject({
          status: 'approved',
          // The refusal's reason belonged to the refusal, and goes with it.
          statusReason: null,
          cancelledBy: null,
          paymentState: 'awaiting',
        });
      });

      it('refuses a product key nothing here answers to', async () => {
        const reference = await place();
        const res = await write({
          orders: [
            instruction({
              reference,
              basedOnRevision: 1,
              lines: [
                { productSourceId: `${SOURCE_PREFIX}-nothing`, pieces: 1 },
              ],
            }),
          ],
        });

        expect((res.data as RunResponse).plan.rowErrors[0]).toMatchObject({
          code: 'unknown-product',
          params: { productSourceId: `${SOURCE_PREFIX}-nothing` },
        });
      });

      it('refuses a decline that does not say why', async () => {
        const reference = await place();
        const res = await write({
          orders: [
            instruction({ reference, basedOnRevision: 1, status: 'declined' }),
          ],
        });

        expect((res.data as RunResponse).plan.rowErrors[0]).toMatchObject({
          code: 'reason-required',
        });
      });

      it('refuses the same order twice in one batch', async () => {
        const reference = await place();
        const res = await write({
          orders: [
            instruction({ reference, basedOnRevision: 1, status: 'approved' }),
            instruction({ reference, basedOnRevision: 2, status: 'ready' }),
          ],
        });

        const body = res.data as RunResponse;
        expect(body.plan.rowErrors[0]).toMatchObject({
          row: 2,
          code: 'duplicate-reference',
        });
        expect(body.plan.summary.update).toBe(1);
      });

      /** A batch is not a transaction: the forty that could be answered are. */
      it('answers the good instructions in a batch that carries a bad one', async () => {
        const good = await place();
        const res = await write({
          orders: [
            instruction({
              reference: `${SOURCE_PREFIX}-NOTHING`,
              basedOnRevision: 1,
              status: 'approved',
            }),
            instruction({
              reference: good,
              basedOnRevision: 1,
              status: 'approved',
            }),
          ],
        });

        const body = res.data as RunResponse;
        expect(body.plan.summary).toMatchObject({ update: 1, errors: 1 });
        expect(body.plan.rowErrors[0].code).toBe('order-not-found');
        expect((await revisionOf(good)).status).toBe('approved');
      });
    });

    describe('the run it leaves behind', () => {
      it('reads its own run back, and no other area’s', async () => {
        const reference = await place();
        const res = await write({
          orders: [
            instruction({ reference, basedOnRevision: 1, status: 'approved' }),
          ],
        });
        const id = (res.data as RunResponse).run.id;

        const back = await axios.get(`/machine/sync/orders/runs/${id}`, {
          headers: { Authorization: `Bearer ${token}` },
          validateStatus: () => true,
        });
        expect(back.status).toBe(200);
        expect(back.data.run).toMatchObject({ id, area: 'orders' });
        // What an automated client is owed is what became of its run, never
        // the address of a person.
        expect(back.data.run).not.toHaveProperty('actorEmail');
      });

      it('records a breakage the source could not turn into a run', async () => {
        const res = await axios.post(
          '/machine/sync/orders/failures',
          { message: 'The order queue could not be read', label: `fail ${R}` },
          {
            headers: { Authorization: `Bearer ${token}` },
            validateStatus: () => true,
          },
        );

        expect(res.status).toBe(201);
        expect(res.data.run).toMatchObject({
          status: 'failed',
          area: 'orders',
          error: 'The order queue could not be read',
        });
      });

      /** The log is a manager's as well as an admin's (FR-ADM-09): an order
       * run is the work on their own desk arriving from somewhere else. */
      it('is listed in the admin log, for a manager too', async () => {
        const res = await axios.get('/admin/sync/runs', {
          params: { area: 'orders' },
          headers: { Cookie: managerCookie },
          validateStatus: () => true,
        });

        expect(res.status).toBe(200);
        expect(res.data.runs.length).toBeGreaterThan(0);
      });
    });
  });
});
