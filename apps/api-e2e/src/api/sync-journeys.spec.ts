import { hash } from '@node-rs/argon2';
import axios from 'axios';
import { Client } from 'pg';

import {
  syncJourneyAdapter,
  SyncJourneyContext,
} from '../journeys/sync.adapter';
import { syncJourneys } from '../journeys/sync.journeys';
import { requireEnv } from '../support/env';
import { JourneyRun } from '../support/journey/journey';

/**
 * A catalogue feed, run by run (FR-ADM-07/09, FR-WORK-02): what reaches the
 * admin's inbox each step, mostly nothing, and what the panel says waits. The
 * journeys (`journeys/sync.journeys.ts`) also generate `docs/catalog-sync.md`;
 * an undeclared mail fails its step.
 */

const R = Date.now().toString(36);
const ADMIN_EMAIL = `e2e-sync-journey-admin-${R}@example.com`;
const PASSWORD = 'e2e-sync-journey-password';
const TOKEN_NAME = `e2e sync journey ${R}`;

describe('an automated catalog feed', () => {
  let client: Client;
  let adminCookie = '';
  let token = '';
  let stagedAtStart = 0;

  const setCatalogOwned = async (owned: boolean) => {
    const res = await axios.put(
      '/settings/ownership',
      { areas: ['catalog'], owned },
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
      { name: TOKEN_NAME, scopes: ['catalog-sync'] },
      { headers: { Cookie: adminCookie } },
    );
    token = issued.data.token;

    // The machine route takes a run only while the catalogue is owned
    // (FR-ADM-10); a global setting, so file parallelism is off.
    await setCatalogOwned(true);

    // Where the feed stands is read off the run before this one, and this
    // database has a history: a leftover failed run would make the journeys'
    // first export a recovery. One empty submission normalises that, changing
    // no product: a `no-change`.
    await axios.post(
      '/machine/sync/runs',
      { rows: [], label: 'journey-baseline' },
      { headers: { Authorization: `Bearer ${token}` } },
    );

    // And what the panel already counts, so the journeys' figures are this
    // feed's own contribution rather than the deployment's backlog.
    const counts = await axios.get('/work/counts', {
      headers: { Cookie: adminCookie },
    });
    stagedAtStart = counts.data.stagedCatalogRuns ?? 0;
  });

  afterAll(async () => {
    await setCatalogOwned(false);
    // Runs first: the token is what they point at.
    await client.query('DELETE FROM sync_runs WHERE "tokenName" = $1', [
      TOKEN_NAME,
    ]);
    await client.query('DELETE FROM api_tokens WHERE name = $1', [TOKEN_NAME]);
    await client.query('DELETE FROM products WHERE "sourceId" LIKE $1', [
      `e2e-sync-journey-%-${R}-%`,
    ]);
    await client.query('DELETE FROM categories WHERE "sourceId" LIKE $1', [
      `e2e-sync-journey-cat-%-${R}`,
    ]);
    await client.query('DELETE FROM users WHERE email = $1', [ADMIN_EMAIL]);
    await client.end();
  });

  describe.each(syncJourneys.map((journey) => [journey.title, journey]))(
    '%s',
    (_title, journey) => {
      let run: JourneyRun<SyncJourneyContext>;

      beforeAll(async () => {
        // One set of product keys per journey: the catalog is shared, and two
        // journeys writing the same products would each see the other's diff.
        const context: SyncJourneyContext = {
          sourceId: `e2e-sync-journey-${journey.slug}-${R}`,
          categorySourceId: `e2e-sync-journey-cat-${journey.slug}-${R}`,
          categoryName: `E2E Sync Journey ${journey.slug} ${R}`,
          token,
          adminCookie,
          stagedAtStart,
        };
        run = new JourneyRun(syncJourneyAdapter, context);
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
