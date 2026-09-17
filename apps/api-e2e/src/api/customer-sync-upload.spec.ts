import { hash } from '@node-rs/argon2';
import axios from 'axios';
import { Client } from 'pg';
import { requireEnv } from '../support/env';

/**
 * The manual customer import (FR-ADM-12) end to end.
 *
 * What is worth proving against a real stack rather than in a unit test: that
 * the upload is an admin's and a manager cannot reach it, that a file goes
 * through the same staged run → commit the exchange does, that the accounts it
 * creates arrive `invited` with no password anybody holds (FR-ADM-13), that a
 * bad cell skips its row without failing the file, and that the whole screen is
 * closed while an external system owns customer accounts (FR-ADM-10) — both
 * when the file goes up and, for a file that went up before, when it is
 * applied.
 *
 * Isolation: every account carries this run's own source key and address, and
 * the one global thing the spec moves — the ownership switch — is put back in
 * `afterAll`.
 */

const ADMIN_EMAIL = 'e2e-customer-upload-admin@example.com';
const MANAGER_EMAIL = 'e2e-customer-upload-manager@example.com';
const PASSWORD = 'e2e-customer-upload-password';

const R = Date.now().toString(36);
const SOURCE_PREFIX = `e2e-upload-${R}`;
const EMAIL_DOMAIN = 'e2e-customer-upload.example';
const TIER_KEY = `e2e-upload-tier-${R}`;

const key = (n: number) => `${SOURCE_PREFIX}-${n}`;
const address = (n: number) => `upload-${n}-${R}@${EMAIL_DOMAIN}`;

function sessionCookie(setCookie: string[] | undefined): string {
  const cookie = setCookie
    ?.find((c) => c.startsWith('session='))
    ?.split(';')[0];
  if (!cookie) throw new Error('expected a session cookie');
  return cookie;
}

function csvForm(csv: string, options?: Record<string, unknown>): FormData {
  const data = new FormData();
  data.append('file', new Blob([csv], { type: 'text/csv' }), 'customers.csv');
  if (options) data.append('options', JSON.stringify(options));
  return data;
}

describe('Manual customer import (FR-ADM-12)', () => {
  let client: Client;
  let adminCookie: string;
  let managerCookie: string;

  const preview = (data: FormData | undefined, cookie = adminCookie) =>
    axios.post('/admin/sync/customers/preview', data, {
      headers: cookie ? { Cookie: cookie } : {},
      validateStatus: () => true,
    });

  const commit = (id: string, cookie = adminCookie) =>
    axios.post(
      `/admin/sync/runs/${id}/commit`,
      {},
      { headers: { Cookie: cookie }, validateStatus: () => true },
    );

  /** Upload and immediately apply — the ordinary admin flow. */
  async function run(csv: string, options?: Record<string, unknown>) {
    const previewed = await preview(csvForm(csv, options));
    expect(previewed.status).toBe(201);
    const committed = await commit(previewed.data.run.id);
    expect(committed.status).toBe(200);
    return { plan: previewed.data.plan, applied: committed.data.applied };
  }

  const accountByKey = async (sourceId: string) => {
    const { rows } = await client.query(
      `SELECT u.email, u.status, u."passwordSetAt", u."firstName",
              u."companyName", t.key AS "tierKey"
         FROM users u
         LEFT JOIN customer_tiers t ON t.id = u."tierId"
        WHERE u."sourceId" = $1`,
      [sourceId],
    );
    return rows[0];
  };

  const setCustomersOwned = async (owned: boolean) => {
    const res = await axios.put(
      '/settings/ownership',
      { areas: ['customers'], owned },
      { headers: { Cookie: adminCookie }, validateStatus: () => true },
    );
    expect(res.status).toBe(200);
  };

  const login = async (email: string) => {
    const res = await axios.post('/auth/login', { email, password: PASSWORD });
    return sessionCookie(res.headers['set-cookie']);
  };

  beforeAll(async () => {
    client = new Client({ connectionString: requireEnv('DATABASE_URL') });
    await client.connect();

    for (const [email, role] of [
      [ADMIN_EMAIL, 'admin'],
      [MANAGER_EMAIL, 'manager'],
    ] as const) {
      await client.query('DELETE FROM users WHERE email = $1', [email]);
      await client.query(
        `INSERT INTO users (email, "passwordHash", role, status)
         VALUES ($1, $2, $3, 'active')`,
        [email, await hash(PASSWORD), role],
      );
    }
    adminCookie = await login(ADMIN_EMAIL);
    managerCookie = await login(MANAGER_EMAIL);

    // A price list of this spec's own, so the tier column has something real
    // to name without touching the deployment's.
    await client.query(
      `INSERT INTO customer_tiers (key, label, "sortOrder")
       VALUES ($1, $1, 900)`,
      [TIER_KEY],
    );
  });

  afterAll(async () => {
    await setCustomersOwned(false);
    await client.query('DELETE FROM sync_runs WHERE "actorEmail" = $1', [
      ADMIN_EMAIL,
    ]);
    await client.query(
      'DELETE FROM password_tokens WHERE "userId" IN (SELECT id FROM users WHERE "sourceId" LIKE $1)',
      [`${SOURCE_PREFIX}%`],
    );
    await client.query('DELETE FROM users WHERE "sourceId" LIKE $1', [
      `${SOURCE_PREFIX}%`,
    ]);
    await client.query('DELETE FROM users WHERE email IN ($1, $2)', [
      ADMIN_EMAIL,
      MANAGER_EMAIL,
    ]);
    await client.query('DELETE FROM customer_tiers WHERE key = $1', [TIER_KEY]);
    await client.end();
  });

  describe('who may reach it', () => {
    it('refuses an anonymous upload', async () => {
      const res = await preview(csvForm('sourceId\n'), '');
      expect(res.status).toBe(401);
    });

    /**
     * The split the whole area is drawn along: a manager works the customers
     * the shop has and may answer a staged run, but bringing several hundred
     * accounts into being from a file is a deployment act.
     */
    it('refuses a manager, who may still read and answer customer runs', async () => {
      const res = await preview(csvForm('sourceId\n'), managerCookie);
      expect(res.status).toBe(403);
    });

    it('refuses a request with no file at all', async () => {
      const res = await preview(undefined);
      expect(res.status).toBe(400);
      expect(res.data.code).toBe('no-file');
    });
  });

  describe('a file that goes up', () => {
    it('invites accounts into being, with no credential of their own', async () => {
      const { plan, applied } = await run(
        'sourceId,email,access,tierKey,firstName\n' +
          `${key(1)},${address(1)},enabled,${TIER_KEY},Ada\n` +
          `${key(2)},${address(2)},enabled,,Grace\n`,
      );

      expect(plan.summary).toMatchObject({ create: 2, mailed: 2 });
      expect(applied).toMatchObject({ create: 2, mailed: 2 });

      const first = await accountByKey(key(1));
      expect(first).toMatchObject({
        email: address(1),
        status: 'invited',
        firstName: 'Ada',
        tierKey: TIER_KEY,
      });
      // FR-ADM-13: an upload cannot set a password any more than the exchange
      // can, so the account holds the stand-in hash nobody knows.
      expect(first.passwordSetAt).toBeNull();

      // An empty tier cell leaves the base price list, rather than being read
      // as a key nobody has.
      expect((await accountByKey(key(2))).tierKey).toBeNull();
    });

    it('writes nothing until the staged run is applied', async () => {
      const previewed = await preview(
        csvForm(`sourceId,email,access\n${key(3)},${address(3)},enabled\n`),
      );

      expect(previewed.status).toBe(201);
      expect(previewed.data.run).toMatchObject({
        status: 'previewed',
        area: 'customers',
        source: 'upload',
        filename: 'customers.csv',
        actorEmail: ADMIN_EMAIL,
      });
      expect(await accountByKey(key(3))).toBeUndefined();

      expect((await commit(previewed.data.run.id)).status).toBe(200);
      expect(await accountByKey(key(3))).toMatchObject({ status: 'invited' });
    });

    /** The go-live's second file: the tiers move, nobody is invited, nobody
     * is emailed. */
    it('updates a price list without touching anybody’s access', async () => {
      const { applied } = await run(
        `sourceId,tierKey\n${key(2)},${TIER_KEY}\n`,
        { fields: ['tier'], createMissing: false },
      );

      expect(applied).toMatchObject({ update: 1, create: 0, mailed: 0 });
      expect((await accountByKey(key(2))).tierKey).toBe(TIER_KEY);
      expect((await accountByKey(key(2))).status).toBe('invited');
    });

    it('skips a row whose cell the column cannot hold and imports the rest', async () => {
      const { plan, applied } = await run(
        'sourceId,email,access\n' +
          `${key(4)},not-an-address,enabled\n` +
          `${key(5)},${address(5)},enabled\n`,
      );

      expect(plan.rowErrors).toEqual([
        {
          row: 1,
          sourceId: key(4),
          code: 'invalid-value',
          params: { column: 'email', value: 'not-an-address' },
        },
      ]);
      expect(applied).toMatchObject({ create: 1, errors: 1 });
      expect(await accountByKey(key(4))).toBeUndefined();
      expect(await accountByKey(key(5))).toMatchObject({ status: 'invited' });
    });

    it('refuses a file whose columns it does not know, naming them', async () => {
      const res = await preview(
        csvForm(`sourceId,password\n${key(6)},hunter2\n`),
      );

      expect(res.status).toBe(400);
      // The refusal envelope every other one travels in: the code at the top,
      // and what the deployment's wording substitutes under `data`.
      expect(res.data).toMatchObject({ code: 'unknown-columns' });
      expect(res.data.data.params.columns).toContain('password');
      expect(await accountByKey(key(6))).toBeUndefined();
    });
  });

  describe('while an external system owns the accounts', () => {
    it('refuses an upload, and refuses applying a file that went up before', async () => {
      // Staged while the shop still holds the pen…
      const staged = await preview(
        csvForm(`sourceId,email,access\n${key(7)},${address(7)},enabled\n`),
      );
      expect(staged.status).toBe(201);

      await setCustomersOwned(true);

      const refused = await preview(
        csvForm(`sourceId,email,access\n${key(8)},${address(8)},enabled\n`),
      );
      expect(refused.status).toBe(409);
      expect(refused.data.code).toBe('customers-externally-owned');

      // …and applied after. Applying is the write, so it is judged by the
      // setting in force now rather than the one in force when the file went
      // up: an upload is not a way to get a manual write in afterwards.
      const applied = await commit(staged.data.run.id);
      expect(applied.status).toBe(409);
      expect(applied.data.code).toBe('customers-externally-owned');
      expect(await accountByKey(key(7))).toBeUndefined();

      await setCustomersOwned(false);
    });
  });
});
