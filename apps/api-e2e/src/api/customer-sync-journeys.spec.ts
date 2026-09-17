import { hash } from '@node-rs/argon2';
import axios from 'axios';
import { Client } from 'pg';
import { requireEnv } from '../support/env';
import { JourneyRun } from '../support/journey/journey';
import {
  customerSyncJourneyAdapter,
  CustomerSyncJourneyContext,
} from '../journeys/customer-sync.adapter';
import { customerSyncJourneys } from '../journeys/customer-sync.journeys';

/**
 * The customer exchange, walked account by account (FR-ADM-11/13/15/17,
 * FR-NOTIF-09, FR-WORK-02).
 *
 * `machine-customer-sync.spec.ts` asks what one submission does: whether a
 * catalog token can reach the route, whether the exchange is refused while
 * nobody has handed accounts over, what a single row means. This suite asks
 * what the *account* experiences across several runs — whether anybody can
 * sign into it at each point, what reached its owner, and what reached the
 * shop, which is usually nothing.
 *
 * The journeys are data (`journeys/customer-sync.journeys.ts`) and are also
 * what `docs/customer-sync.md` is generated from. Every step asserts the whole
 * observable state: a reading nobody mentioned is asserted unchanged, and a
 * mail nobody declared fails the step that sent it.
 */

const R = Date.now().toString(36);
const ADMIN_EMAIL = `e2e-cust-journey-admin-${R}@example.com`;
const PASSWORD = 'e2e-cust-journey-password';
const CUSTOMER_PASSWORD = 'e2e-cust-journey-Ihre-Wahl-42';
const TOKEN_NAME = `e2e customer journey ${R}`;
const EMAIL_DOMAIN = 'e2e-customer-journeys.example';

describe('the customer exchange', () => {
  let client: Client;
  let adminCookie = '';
  let token = '';
  let tierKey = '';
  let stagedAtStart = 0;

  const setCustomersOwned = async (owned: boolean) => {
    const res = await axios.put(
      '/settings/ownership',
      { areas: ['customers'], owned },
      { headers: { Cookie: adminCookie }, validateStatus: () => true },
    );
    expect(res.status).toBe(200);
  };

  beforeAll(async () => {
    client = new Client({ connectionString: requireEnv('DATABASE_URL') });
    await client.connect();

    await client.query(
      `INSERT INTO users (email, "passwordHash", role, status, "passwordSetAt")
       VALUES ($1, $2, 'admin', 'active', now())`,
      [ADMIN_EMAIL, await hash(PASSWORD)],
    );
    const login = await axios.post('/auth/login', {
      email: ADMIN_EMAIL,
      password: PASSWORD,
    });
    adminCookie = (login.headers['set-cookie'] as string[] | undefined)
      ?.find((entry) => entry.startsWith('session='))
      ?.split(';')[0] as string;
    if (!adminCookie) throw new Error(`admin login failed: ${login.status}`);

    // Issued through the API rather than inserted: the value is returned once.
    const issued = await axios.post(
      '/admin/api-tokens',
      { name: TOKEN_NAME, scopes: ['customer-sync'] },
      { headers: { Cookie: adminCookie } },
    );
    token = issued.data.token;

    // The deployment's own first price list. Read rather than named: a tier key
    // is a shop's commercial vocabulary and this suite has no business
    // inventing one.
    const tiers = await client.query(
      'SELECT key FROM customer_tiers ORDER BY "sortOrder" LIMIT 1',
    );
    tierKey = tiers.rows[0].key;

    // The machine route only accepts a run while customer accounts are
    // externally owned (FR-ADM-10), and the setting is global — which is why
    // this suite runs with the file parallelism off, like the catalog one.
    await setCustomersOwned(true);

    // Where the exchange stands is read off the run before this one, and this
    // database has a history: a leftover failed run would make the journeys'
    // first submission a recovery. One empty submission normalises that
    // without touching anybody's account — it is recorded as the `no-change`
    // it is.
    await axios.post(
      '/machine/sync/customers/runs',
      { rows: [], label: 'journey-baseline' },
      { headers: { Authorization: `Bearer ${token}` } },
    );

    // And what the panel already counts, so the journeys' figures are this
    // exchange's own contribution rather than the deployment's backlog.
    const counts = await axios.get('/work/counts', {
      headers: { Cookie: adminCookie },
    });
    stagedAtStart = counts.data.stagedCustomerRuns ?? 0;
  });

  afterAll(async () => {
    await setCustomersOwned(false);
    // Runs first: the token is what they point at.
    await client.query('DELETE FROM sync_runs WHERE "tokenName" = $1', [
      TOKEN_NAME,
    ]);
    await client.query('DELETE FROM api_tokens WHERE name = $1', [TOKEN_NAME]);
    await client.query('DELETE FROM users WHERE email LIKE $1', [
      `%@${EMAIL_DOMAIN}`,
    ]);
    await client.query('DELETE FROM users WHERE email = $1', [ADMIN_EMAIL]);
    await client.end();
  });

  describe.each(
    customerSyncJourneys.map((journey) => [journey.title, journey]),
  )('%s', (_title, journey) => {
    let run: JourneyRun<CustomerSyncJourneyContext>;

    beforeAll(async () => {
      // One account per journey: two journeys sharing an address would each
      // see the other's writes, and the whole point is what *this* sequence
      // of runs did.
      const context: CustomerSyncJourneyContext = {
        sourceId: `e2e-cust-journey-${journey.slug}-${R}`,
        email: `${journey.slug}-${R}@${EMAIL_DOMAIN}`,
        password: CUSTOMER_PASSWORD,
        tierKey,
        token,
        adminCookie,
        stagedAtStart,
      };
      run = new JourneyRun(customerSyncJourneyAdapter, context);
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
  });
});
