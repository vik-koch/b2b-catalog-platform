import { hash } from '@node-rs/argon2';
import axios from 'axios';
import { Client } from 'pg';
import { requireEnv } from '../support/env';

/**
 * The headless catalog sync (FR-ADM-07, ADR 0055) end to end: a token submits
 * rows, and what happens next is decided by the diff rather than by the
 * caller.
 *
 * What is worth proving against a real stack rather than in a unit test is the
 * seam between the two: that the policy actually stops a run from applying
 * itself, that a staged run is then an admin's to apply or to discard, and
 * that a machine and a session cannot borrow each other's way in.
 *
 * Isolation, as in the upload spec: everything created here lives under a
 * category this spec makes, and the one catalog-wide operation — the delete
 * sweep — is only ever *staged*, never applied.
 */

const ADMIN_EMAIL = 'e2e-machine-sync-admin@example.com';
const PASSWORD = 'e2e-machine-sync-password';

const R = Date.now().toString(36);
const TOKEN_NAME = `e2e machine sync ${R}`;
const CATEGORY_NAME = `E2E Machine Category ${R}`;
const CATEGORY_SOURCE_ID = `e2e-machine-cat-${R}`;
const SOURCE_PREFIX = `e2e-machine-${R}`;

/** The demo config's ceiling on creates; a run above it waits for a person. */
const MAX_CREATES = 100;

interface Row {
  sourceId: string;
  name?: string;
  categorySourceId?: string;
  categoryName?: string;
  prices?: Record<string, number>;
  stockPieces?: number;
}

function sessionCookie(setCookie: string[] | undefined): string {
  const cookie = setCookie
    ?.find((c) => c.startsWith('session='))
    ?.split(';')[0];
  if (!cookie) throw new Error('expected a session cookie');
  return cookie;
}

/** A complete row: enough for the run to be able to create the product. */
function row(n: number, over: Partial<Row> = {}): Row {
  return {
    sourceId: `${SOURCE_PREFIX}-${n}`,
    name: `E2E Machine Product ${n} ${R}`,
    categorySourceId: CATEGORY_SOURCE_ID,
    categoryName: CATEGORY_NAME,
    prices: { default: 1000 + n },
    ...over,
  };
}

describe('Headless catalog sync (FR-ADM-07)', () => {
  let client: Client;
  let adminCookie: string;
  let token: string;

  const submit = (body: unknown, bearer = token) =>
    axios.post('/machine/sync/runs', body, {
      headers: bearer ? { Authorization: `Bearer ${bearer}` } : {},
      validateStatus: () => true,
    });

  const reportFailure = (body: unknown, bearer = token) =>
    axios.post('/machine/sync/failures', body, {
      headers: bearer ? { Authorization: `Bearer ${bearer}` } : {},
      validateStatus: () => true,
    });

  const asAdmin = (method: 'get' | 'post', url: string) =>
    axios.request({
      method,
      url,
      data: method === 'post' ? {} : undefined,
      headers: { Cookie: adminCookie },
      validateStatus: () => true,
    });

  const productBySourceId = async (sourceId: string) => {
    const { rows } = await client.query(
      'SELECT name, "defaultPriceMinor" AS "priceMinor", "publishedAt" FROM products WHERE "sourceId" = $1',
      [sourceId],
    );
    return rows[0];
  };

  beforeAll(async () => {
    client = new Client({ connectionString: requireEnv('DATABASE_URL') });
    await client.connect();

    await client.query('DELETE FROM users WHERE email = $1', [ADMIN_EMAIL]);
    await client.query(
      `INSERT INTO users (email, "passwordHash", role, status)
       VALUES ($1, $2, 'admin', 'active')`,
      [ADMIN_EMAIL, await hash(PASSWORD)],
    );
    const login = await axios.post('/auth/login', {
      email: ADMIN_EMAIL,
      password: PASSWORD,
    });
    adminCookie = sessionCookie(login.headers['set-cookie']);

    // Issued through the API rather than inserted: the value is only ever
    // returned once, and this spec needs the value.
    const issued = await axios.post(
      '/admin/api-tokens',
      { name: TOKEN_NAME, scopes: ['catalog-sync'] },
      { headers: { Cookie: adminCookie } },
    );
    token = issued.data.token;
  });

  afterAll(async () => {
    await client.query('DELETE FROM sync_runs WHERE "tokenName" LIKE $1', [
      `${TOKEN_NAME}%`,
    ]);
    await client.query('DELETE FROM sync_runs WHERE "actorEmail" = $1', [
      ADMIN_EMAIL,
    ]);
    await client.query('DELETE FROM api_tokens WHERE name LIKE $1', [
      `${TOKEN_NAME}%`,
    ]);
    await client.query('DELETE FROM products WHERE "sourceId" LIKE $1', [
      `${SOURCE_PREFIX}%`,
    ]);
    await client.query('DELETE FROM categories WHERE "sourceId" = $1', [
      CATEGORY_SOURCE_ID,
    ]);
    await client.query('DELETE FROM users WHERE email = $1', [ADMIN_EMAIL]);
    await client.end();
  });

  describe('authentication', () => {
    it('refuses a submission with no credential', async () => {
      expect((await submit({ rows: [] }, '')).status).toBe(401);
    });

    /** The two paths never substitute for each other: an admin's cookie is
     * not a machine credential, whatever that admin may do elsewhere. */
    it('refuses an admin session on the machine route', async () => {
      const res = await axios.post(
        '/machine/sync/runs',
        { rows: [] },
        { headers: { Cookie: adminCookie }, validateStatus: () => true },
      );
      expect(res.status).toBe(401);
    });

    it('refuses a revoked token from the next request on', async () => {
      const issued = await axios.post(
        '/admin/api-tokens',
        { name: `${TOKEN_NAME} doomed`, scopes: ['catalog-sync'] },
        { headers: { Cookie: adminCookie } },
      );
      expect((await submit({ rows: [] }, issued.data.token)).status).toBe(201);

      await asAdmin('post', `/admin/api-tokens/${issued.data.id}/revoke`);

      expect((await submit({ rows: [] }, issued.data.token)).status).toBe(401);
    });
  });

  describe('a run within the policy', () => {
    it('applies itself, and records the token that sent it', async () => {
      const res = await submit({
        rows: [row(1), row(2)],
        label: 'nightly-export',
      });

      expect(res.status).toBe(201);
      expect(res.data.run).toMatchObject({
        status: 'applied',
        source: 'api',
        tokenName: TOKEN_NAME,
        // No person was involved, and the run does not pretend one was.
        actorEmail: null,
        stagedReason: null,
        filename: 'nightly-export',
      });
      expect(res.data.plan.summary.create).toBe(2);

      const product = await productBySourceId(`${SOURCE_PREFIX}-1`);
      expect(product.priceMinor).toBe(1001);
      // FR-ADM-06 is unchanged by the entry point: an imported product still
      // waits for an admin before the storefront sees it.
      expect(product.publishedAt).toBeNull();
    });

    it('is idempotent in effect: the same rows again change nothing', async () => {
      const res = await submit({ rows: [row(1), row(2)] });

      expect(res.data.run.status).toBe('applied');
      expect(res.data.plan.summary.create).toBe(0);
      expect(res.data.plan.summary.unchanged).toBe(2);
    });
  });

  describe('a run outside the policy', () => {
    it('stages a run that creates more than the ceiling allows', async () => {
      const rows = Array.from({ length: MAX_CREATES + 1 }, (_, i) =>
        row(100 + i),
      );

      const res = await submit({ rows });

      expect(res.data.run).toMatchObject({
        status: 'previewed',
        stagedReason: 'policy',
      });
      expect(res.data.plan.summary.create).toBe(MAX_CREATES + 1);
      // Staged means nothing was written.
      expect(await productBySourceId(`${SOURCE_PREFIX}-100`)).toBeUndefined();
    });

    /** The effect the whole mechanism exists for. Staged, never applied — a
     * sweep that reaches the seeded catalog is exactly what must not happen
     * without somebody looking at it. */
    it('stages a sweep that would hide products', async () => {
      const res = await submit({
        rows: [row(1)],
        options: {
          productSetAuthoritative: true,
          softDeleteMissingProducts: true,
        },
      });

      expect(res.data.run.status).toBe('previewed');
      expect(res.data.run.stagedReason).toBe('policy');
      expect(res.data.plan.summary.softDelete).toBeGreaterThan(0);

      await asAdmin('post', `/admin/sync/runs/${res.data.run.id}/discard`);
    });

    /** ADR 0026's gate is unchanged and comes first: authority over the
     * product set is what deletion needs, and the policy applies on top. */
    it('refuses a delete without the claim that the file is complete', async () => {
      const res = await submit({
        rows: [row(1)],
        options: { softDeleteMissingProducts: true },
      });

      expect(res.status).toBe(400);
    });

    it('stages a run the caller asked to be doubted, however small', async () => {
      const res = await submit({ rows: [row(1)], requestReview: true });

      expect(res.data.run).toMatchObject({
        status: 'previewed',
        stagedReason: 'requested',
      });
    });
  });

  describe('a staged run', () => {
    it('is replaced by the next one, which the log keeps as never applied', async () => {
      const first = await submit({ rows: [row(3)], requestReview: true });
      const second = await submit({ rows: [row(4)], requestReview: true });

      const stale = await asAdmin(
        'get',
        `/admin/sync/runs/${first.data.run.id}`,
      );
      expect(stale.data.run.status).toBe('superseded');
      expect(second.data.run.status).toBe('previewed');

      // And it cannot be applied by an admin who still had it open.
      const refused = await asAdmin(
        'post',
        `/admin/sync/runs/${first.data.run.id}/commit`,
      );
      expect(refused.status).toBe(409);
      expect(refused.data.code).toBe('run-superseded');
    });

    it('is applied by an admin, who is recorded beside the token', async () => {
      const staged = await submit({ rows: [row(5)], requestReview: true });

      const applied = await asAdmin(
        'post',
        `/admin/sync/runs/${staged.data.run.id}/commit`,
      );

      expect(applied.status).toBe(200);
      expect(applied.data.run).toMatchObject({
        status: 'applied',
        tokenName: TOKEN_NAME,
        actorEmail: ADMIN_EMAIL,
      });
      expect(await productBySourceId(`${SOURCE_PREFIX}-5`)).toBeDefined();
    });

    it('is discarded by an admin, and stays in the log as discarded', async () => {
      const staged = await submit({ rows: [row(6)], requestReview: true });

      const discarded = await asAdmin(
        'post',
        `/admin/sync/runs/${staged.data.run.id}/discard`,
      );

      expect(discarded.status).toBe(200);
      expect(discarded.data.run.status).toBe('discarded');
      expect(await productBySourceId(`${SOURCE_PREFIX}-6`)).toBeUndefined();

      const again = await asAdmin(
        'post',
        `/admin/sync/runs/${staged.data.run.id}/commit`,
      );
      expect(again.data.code).toBe('run-discarded');
    });
  });

  describe('a failure the caller reports', () => {
    /** A feed that has stopped working otherwise looks exactly like a feed
     * with nothing to send (NFR-OPS-07). */
    it('is recorded as a failed run, with no intent and no counts', async () => {
      const res = await reportFailure({
        message: 'Session 4 timed out reassembling the export',
        label: 'nightly-export',
      });

      expect(res.status).toBe(201);
      expect(res.data.run).toMatchObject({
        status: 'failed',
        source: 'api',
        tokenName: TOKEN_NAME,
        filename: 'nightly-export',
        error: 'Session 4 timed out reassembling the export',
        options: null,
        summary: null,
      });
      expect(res.data.run.finishedAt).not.toBeNull();
    });

    it('shows up in the admin log', async () => {
      const res = await asAdmin('get', '/admin/sync/runs?status=failed');

      expect(res.status).toBe(200);
      expect(
        res.data.runs.some(
          (run: { tokenName: string | null }) => run.tokenName === TOKEN_NAME,
        ),
      ).toBe(true);
    });

    it('refuses an empty report', async () => {
      expect((await reportFailure({ message: '' })).status).toBe(400);
    });
  });
});
