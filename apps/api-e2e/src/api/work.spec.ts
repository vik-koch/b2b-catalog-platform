import { hash } from '@node-rs/argon2';
import axios from 'axios';
import { Client } from 'pg';
import { WorkCounts } from '@b2b-catalog-platform/shared';
import { requireEnv } from '../support/env';

/**
 * What awaits the signed-in account (FR-WORK-01…04). The suite shares one
 * database with every other spec and runs in parallel with them, so nothing
 * here asserts an absolute figure or a delta: what is pinned is the **shape**
 * per role — which queues an account is even told about — and that work this
 * spec creates is in the count while it waits. Which rows each count is over
 * is WorkService's unit spec.
 */

const PREFIX = 'e2e-work';
const ADMIN_EMAIL = `${PREFIX}-admin@example.com`;
const MANAGER_EMAIL = `${PREFIX}-manager@example.com`;
const CUSTOMER_EMAIL = `${PREFIX}-customer@example.com`;
const PENDING_EMAIL = `${PREFIX}-pending@example.com`;
const PASSWORD = 'e2e-work-password';

function sessionCookie(setCookie: string[] | undefined): string | undefined {
  return setCookie?.find((c) => c.startsWith('session='))?.split(';')[0];
}

async function login(email: string): Promise<string> {
  const res = await axios.post('/auth/login', { email, password: PASSWORD });
  const cookie = sessionCookie(res.headers['set-cookie']);
  if (!cookie) throw new Error('login did not return a session cookie');
  return cookie;
}

async function counts(cookie: string): Promise<WorkCounts> {
  const res = await axios.get('/work/counts', { headers: { Cookie: cookie } });
  expect(res.status).toBe(200);
  return res.data;
}

describe('work counts', () => {
  let client: Client;
  let admin: string;
  let manager: string;
  let customer: string;
  /** Removed in afterAll — it is created to be counted, and nothing else. */
  let productSlug: string | undefined;

  beforeAll(async () => {
    client = new Client({ connectionString: requireEnv('DATABASE_URL') });
    await client.connect();
    const passwordHash = await hash(PASSWORD);
    for (const [email, role] of [
      [ADMIN_EMAIL, 'admin'],
      [MANAGER_EMAIL, 'manager'],
      [CUSTOMER_EMAIL, 'user'],
    ] as const) {
      await client.query('DELETE FROM users WHERE email = $1', [email]);
      await client.query(
        `INSERT INTO users (email, "passwordHash", role, status)
         VALUES ($1, $2, $3, 'active')`,
        [email, passwordHash, role],
      );
    }
    await client.query('DELETE FROM users WHERE email = $1', [PENDING_EMAIL]);

    [admin, manager, customer] = await Promise.all([
      login(ADMIN_EMAIL),
      login(MANAGER_EMAIL),
      login(CUSTOMER_EMAIL),
    ]);
  });

  afterAll(async () => {
    if (productSlug) {
      await client.query('DELETE FROM products WHERE slug = $1', [productSlug]);
    }
    await client.query('DELETE FROM users WHERE email = ANY($1)', [
      [ADMIN_EMAIL, MANAGER_EMAIL, CUSTOMER_EMAIL, PENDING_EMAIL],
    ]);
    await client.end();
  });

  it('refuses a visitor with no session', async () => {
    const res = await axios.get('/work/counts', {
      validateStatus: () => true,
    });

    expect(res.status).toBe(401);
  });

  it('tells an admin about all three staff queues', async () => {
    expect(Object.keys(await counts(admin)).sort()).toEqual([
      'orders',
      'registrations',
      'unpublishedProducts',
    ]);
  });

  // Absent, not zero: the products screen refuses a manager, so a count
  // linking there would be a count they cannot act on (FR-WORK-04).
  it('leaves the catalog queue out for a manager', async () => {
    expect(Object.keys(await counts(manager)).sort()).toEqual([
      'orders',
      'registrations',
    ]);
  });

  it('tells a customer only about their own orders', async () => {
    expect(await counts(customer)).toEqual({ myOrders: 0 });
  });

  /**
   * The linkage ADR 0046 rests on: the figure follows the state, with nothing
   * acknowledged in between. Asserted as a floor rather than as a delta —
   * the suite shares one database and runs in parallel, so the only thing that
   * holds for the whole of a test is that *our own* waiting row is in there.
   * Which rows each count is over is pinned in WorkService's unit spec.
   */
  it('counts a registration for as long as it waits', async () => {
    // Written straight to the table rather than through /auth/register: that
    // endpoint mails the shop, and register.spec counts those mails.
    await client.query(
      `INSERT INTO users (email, "passwordHash", role, status, "firstName", "lastName")
       VALUES ($1, $2, 'user', 'pending', 'Pending', 'Registration')`,
      // A pending account has no password of its own; the column is not
      // nullable, and nothing here ever signs this row in.
      [PENDING_EMAIL, 'unusable'],
    );

    expect((await counts(manager)).registrations).toBeGreaterThanOrEqual(1);
    // The same queue, the same rows: a customer is never told about it.
    expect(await counts(customer)).toEqual({ myOrders: 0 });
  });

  /** The same, for the review queue a sync run fills (FR-ADM-06): a created
   * product is unpublished until an admin says otherwise. */
  it('counts an unpublished product for as long as it is off the storefront', async () => {
    const { rows } = await client.query<{ id: string }>(
      "SELECT id FROM categories WHERE slug = 'cleaning'",
    );
    const created = await axios.post(
      '/admin/catalog/products',
      {
        name: `Work Queue ${PREFIX}`,
        priceMinor: 1234,
        categoryId: rows[0].id,
      },
      { headers: { Cookie: admin } },
    );
    expect(created.status).toBe(201);
    productSlug = created.data.slug;

    expect((await counts(admin)).unpublishedProducts).toBeGreaterThanOrEqual(1);
  });
});
