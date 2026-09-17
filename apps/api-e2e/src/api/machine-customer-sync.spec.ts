import { hash } from '@node-rs/argon2';
import axios from 'axios';
import { Client } from 'pg';
import { requireEnv } from '../support/env';
import { deleteMatching, messagesMatching } from '../support/mailpit';
import { readFileSync } from 'node:fs';

/**
 * The headless customer exchange (FR-ADM-11) end to end.
 *
 * What is worth proving against a real stack rather than in a unit test is
 * everything the differ cannot see: that a catalog credential cannot reach
 * this route at all, that the exchange is refused unless somebody has handed
 * customer accounts over, that an account it asks for arrives `invited` with no
 * password anybody holds (FR-ADM-13), that a run taking access away waits for a
 * person, that the person who may answer it is a manager as well as an admin,
 * and that what the admin is written to about it is worded about accounts
 * rather than about the catalog (FR-NOTIF-09) — which is the one part of the
 * notification that a unit test proves only for a notifier it constructs
 * itself, never for the service that has to call it.
 *
 * Isolation: every account this spec touches carries its own source key and
 * address, and the one global thing it moves — the ownership switch — is put
 * back in `afterAll`, as the catalog's machine spec does.
 */

const ADMIN_EMAIL = 'e2e-machine-customers-admin@example.com';
const MANAGER_EMAIL = 'e2e-machine-customers-manager@example.com';
const PASSWORD = 'e2e-machine-customers-password';

const R = Date.now().toString(36);
const TOKEN_NAME = `e2e customer sync ${R}`;
const SOURCE_PREFIX = `e2e-cust-${R}`;
const EMAIL_DOMAIN = 'e2e-customers.example';

function sessionCookie(setCookie: string[] | undefined): string {
  const cookie = setCookie
    ?.find((c) => c.startsWith('session='))
    ?.split(';')[0];
  if (!cookie) throw new Error('expected a session cookie');
  return cookie;
}

/** The deployment's own wording, read where the app reads it: a subject
 * asserted as a literal here would pass against the catalog's. */
const mailText = JSON.parse(
  readFileSync(requireEnv('MAIL_TEXT_FILE'), 'utf8'),
) as {
  syncRun: {
    areas: Record<string, Record<string, { subject: string }>>;
  };
};
const WAITING = mailText.syncRun.areas.customers.waiting.subject;
// Scoped to this suite's own mail: the admin inbox is shared with every other
// suite, and the catalog's machine spec writes to it about its own runs.
const WAITING_MAIL = `to:"${requireEnv('MAIL_ADMIN_TO')}" subject:"${WAITING}"`;

const key = (n: number) => `${SOURCE_PREFIX}-${n}`;
const address = (n: number) => `customer-${n}-${R}@${EMAIL_DOMAIN}`;

describe('Headless customer exchange (FR-ADM-11)', () => {
  let client: Client;
  let adminCookie: string;
  let managerCookie: string;
  let token: string;
  let catalogToken: string;

  const submit = (body: unknown, bearer = token) =>
    axios.post('/machine/sync/customers/runs', body, {
      headers: bearer ? { Authorization: `Bearer ${bearer}` } : {},
      validateStatus: () => true,
    });

  const asStaff = (cookie: string, method: 'get' | 'post', url: string) =>
    axios.request({
      method,
      url,
      data: method === 'post' ? {} : undefined,
      headers: { Cookie: cookie },
      validateStatus: () => true,
    });

  const accountByKey = async (sourceId: string) => {
    const { rows } = await client.query(
      `SELECT u.email, u.status, u."passwordSetAt", u."tokenVersion",
              u."firstName", u."companyName", t.key AS "tierKey"
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

    // Issued through the API rather than inserted: the value is only ever
    // returned once, and this spec needs the value.
    const issued = await axios.post(
      '/admin/api-tokens',
      { name: TOKEN_NAME, scopes: ['customer-sync'] },
      { headers: { Cookie: adminCookie } },
    );
    token = issued.data.token;

    const catalogOnly = await axios.post(
      '/admin/api-tokens',
      { name: `${TOKEN_NAME} catalog`, scopes: ['catalog-sync'] },
      { headers: { Cookie: adminCookie } },
    );
    catalogToken = catalogOnly.data.token;
  });

  afterAll(async () => {
    await setCustomersOwned(false);
    await client.query('DELETE FROM sync_runs WHERE "tokenName" LIKE $1', [
      `${TOKEN_NAME}%`,
    ]);
    await client.query('DELETE FROM api_tokens WHERE name LIKE $1', [
      `${TOKEN_NAME}%`,
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
    await client.end();
  });

  describe('who may reach it', () => {
    it('refuses a submission with no credential', async () => {
      expect((await submit({ rows: [] }, '')).status).toBe(401);
    });

    /** The scope is the boundary: a credential that receives the catalog has
     * no business writing to people's accounts. */
    it('refuses a catalog token', async () => {
      const res = await submit({ rows: [] }, catalogToken);
      expect(res.status).toBe(403);
      expect(res.data.code).toBe('insufficient-scope');
    });

    it('refuses an admin session on the machine route', async () => {
      const res = await axios.post(
        '/machine/sync/customers/runs',
        { rows: [] },
        { headers: { Cookie: adminCookie }, validateStatus: () => true },
      );
      expect(res.status).toBe(401);
    });

    /** The other half of the mutual exclusion (FR-ADM-10): while the shop
     * still works its own customers, a second writer is refused. */
    it('refuses a run while customer accounts are not externally owned', async () => {
      const res = await submit({ rows: [] });
      expect(res.status).toBe(409);
      expect(res.data.code).toBe('customers-not-externally-owned');
    });
  });

  describe('once customer accounts are handed over', () => {
    beforeAll(async () => {
      await setCustomersOwned(true);
    });

    it('invites an account into being, with no credential of its own', async () => {
      const res = await submit({
        rows: [
          {
            sourceId: key(1),
            email: address(1),
            access: 'enabled',
            firstName: 'Ada',
            lastName: 'Lovelace',
          },
        ],
        label: 'nightly-customers',
      });

      expect(res.status).toBe(201);
      expect(res.data.run).toMatchObject({
        status: 'applied',
        area: 'customers',
        source: 'api',
        tokenName: TOKEN_NAME,
        actorEmail: null,
        filename: 'nightly-customers',
      });
      expect(res.data.plan.summary).toMatchObject({ create: 1, mailed: 1 });

      const account = await accountByKey(key(1));
      expect(account).toMatchObject({
        email: address(1),
        status: 'invited',
        firstName: 'Ada',
      });
      // FR-ADM-13: the exchange cannot set a password, so the account holds
      // the stand-in hash nobody knows and has never chosen one.
      expect(account.passwordSetAt).toBeNull();
    });

    it('cannot sign the new account in, because there is no password to use', async () => {
      const res = await axios.post(
        '/auth/login',
        { email: address(1), password: PASSWORD },
        { validateStatus: () => true },
      );
      expect(res.status).toBe(401);
    });

    /** FR-ADM-16: the feed sends its whole record every run. */
    it('records a repeated instruction as a run that changed nothing', async () => {
      const res = await submit({
        rows: [{ sourceId: key(1), email: address(1), access: 'enabled' }],
      });

      expect(res.status).toBe(201);
      expect(res.data.run.status).toBe('no-change');
      expect(res.data.plan.summary).toMatchObject({ unchanged: 1, update: 0 });
    });

    it('skips a row that names a staff account', async () => {
      const { rows } = await client.query(
        'SELECT id FROM users WHERE email = $1',
        [MANAGER_EMAIL],
      );
      await client.query('UPDATE users SET "sourceId" = $1 WHERE id = $2', [
        key(99),
        rows[0].id,
      ]);

      const res = await submit({
        rows: [{ sourceId: key(99), access: 'disabled' }],
      });

      expect(res.data.plan.rowErrors[0].code).toBe('staff-account');
      const { rows: after } = await client.query(
        'SELECT status FROM users WHERE id = $1',
        [rows[0].id],
      );
      expect(after[0].status).toBe('active');
      await client.query('UPDATE users SET "sourceId" = NULL WHERE id = $1', [
        rows[0].id,
      ]);
    });

    describe('a run that takes access away', () => {
      let runId: string;

      it('waits for a person rather than applying itself', async () => {
        const res = await submit({
          rows: [{ sourceId: key(1), access: 'disabled' }],
        });

        expect(res.status).toBe(201);
        expect(res.data.run).toMatchObject({
          status: 'previewed',
          stagedReason: 'policy',
        });
        expect(res.data.plan.summary.softDelete).toBe(1);
        runId = res.data.run.id;

        // Nothing has happened to the account: a staged run is a description,
        // not a write.
        expect((await accountByKey(key(1))).status).toBe('invited');
      });

      /**
       * The mail the staged run wrote. Its subject is the customer exchange's
       * own, which is the whole point: an inbox shows the subject, and
       * "A catalog update is waiting for you" about an account import is wrong
       * in the one line that gets read.
       */
      it('tells the admin about it in the customer exchange’s own words', async () => {
        const [message] = await messagesMatching(WAITING_MAIL);

        expect(message?.Subject).toBe(WAITING);
        await deleteMatching(WAITING_MAIL);
      });

      it('is readable by a manager, whose work customer accounts are', async () => {
        const res = await asStaff(
          managerCookie,
          'get',
          `/admin/sync/runs/${runId}`,
        );
        expect(res.status).toBe(200);
        expect(res.data.run.area).toBe('customers');
        expect(res.data.plan.accounts[0]).toMatchObject({ kind: 'disable' });
      });

      it('is applied by that manager, and the account loses its access', async () => {
        const res = await asStaff(
          managerCookie,
          'post',
          `/admin/sync/runs/${runId}/commit`,
        );

        expect(res.status).toBe(200);
        expect(res.data.run).toMatchObject({
          status: 'applied',
          actorEmail: MANAGER_EMAIL,
        });

        const account = await accountByKey(key(1));
        expect(account.status).toBe('disabled');
        // The half that matters on the day it is used: every session already
        // in flight ends with the status.
        expect(account.tokenVersion).toBeGreaterThan(0);
      });

      it('switches the same account back on when the next run says so', async () => {
        const res = await submit({
          rows: [{ sourceId: key(1), access: 'enabled' }],
        });

        expect(res.data.run.status).toBe('applied');
        // It never chose a password, so it goes back to where it was rather
        // than to `active`.
        expect((await accountByKey(key(1))).status).toBe('invited');
      });
    });

    describe('claiming an account somebody registered here (FR-ADM-17)', () => {
      /**
       * The deadlock this closes. Somebody signs up on the storefront while
       * the area is owned: the account has no source key, so nothing the
       * exchange sends can reach it, and staff actions on customers are
       * refused whole — nobody on either side can approve them.
       */
      const selfRegistered = address(90);

      beforeAll(async () => {
        await client.query(
          `INSERT INTO users (email, "passwordHash", role, status, "firstName", "lastName")
           VALUES ($1, $2, 'user', 'pending', 'Grace', 'Hopper')`,
          [selfRegistered, await hash(PASSWORD)],
        );
      });

      afterAll(async () => {
        await client.query('DELETE FROM users WHERE email = $1', [
          selfRegistered,
        ]);
      });

      it('refuses the row as unclaimed, not as a taken address, by default', async () => {
        const res = await submit({
          rows: [
            { sourceId: key(90), email: selfRegistered, access: 'enabled' },
          ],
        });

        expect(res.status).toBe(201);
        expect(res.data.plan.rowErrors[0]).toMatchObject({
          code: 'account-unclaimed',
        });
        // Nothing was created under a second address, which is what the old
        // refusal left an operator guessing about.
        expect(await accountByKey(key(90))).toBeUndefined();
      });

      it('waits for a person when it is asked to claim one', async () => {
        // `maxClaims` is zero by default, so an adoption is never applied
        // unattended: a typo'd address upstream must not take over a real
        // customer's account inside a run nobody read.
        const res = await submit({
          rows: [
            { sourceId: key(90), email: selfRegistered, access: 'enabled' },
          ],
          options: { claimByEmail: true },
        });

        expect(res.data.run).toMatchObject({
          status: 'previewed',
          stagedReason: 'policy',
        });
        expect(res.data.plan.summary).toMatchObject({ claimed: 1 });
        expect(res.data.plan.accounts[0]).toMatchObject({ kind: 'claim' });
        expect(await accountByKey(key(90))).toBeUndefined();
      });

      it('adopts the account, and approves it, once a person applies it', async () => {
        const staged = await submit({
          rows: [
            { sourceId: key(90), email: selfRegistered, access: 'enabled' },
          ],
          options: { claimByEmail: true },
        });
        const runId = staged.data.run.id;

        const applied = await asStaff(
          managerCookie,
          'post',
          `/admin/sync/runs/${runId}/commit`,
        );
        expect(applied.status).toBe(200);

        const account = await accountByKey(key(90));
        // The same row, now reachable by key — not a second account beside it.
        expect(account).toMatchObject({
          email: selfRegistered,
          status: 'invited',
          firstName: 'Grace',
        });
      });

      it('leaves the key alone on the next run, which claims nothing', async () => {
        // Identity is the key from here on, exactly as FR-ADM-14 says: the
        // claim happened once.
        const res = await submit({
          rows: [
            { sourceId: key(90), email: selfRegistered, access: 'enabled' },
          ],
          options: { claimByEmail: true },
        });

        expect(res.data.run.status).toBe('no-change');
        expect(res.data.plan.summary).toMatchObject({ claimed: 0 });
      });
    });

    it('sets the price list a customer is charged', async () => {
      const { rows } = await client.query(
        'SELECT key FROM customer_tiers ORDER BY "sortOrder" LIMIT 1',
      );
      const tierKey = rows[0].key;

      const res = await submit({
        rows: [{ sourceId: key(1), tierKey }],
      });

      expect(res.data.run.status).toBe('applied');
      expect((await accountByKey(key(1))).tierKey).toBe(tierKey);
    });
  });
});
