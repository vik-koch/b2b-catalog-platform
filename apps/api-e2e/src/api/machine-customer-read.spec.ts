import { hash } from '@node-rs/argon2';
import axios from 'axios';
import { Client } from 'pg';
import { requireEnv } from '../support/env';

/**
 * The outbound read of customer accounts (FR-ADM-18) end to end.
 *
 * What is worth proving against a real stack is everything the shape of the
 * response alone does not say: that it is its own capability and a
 * customer-sync credential cannot reach it, that it answers whether or not
 * anybody owns customers — which is the whole point, since the account it
 * exists to reveal is one registered here while the shop still runs itself —
 * that staff never appear in it, that a withdrawn account is reported as
 * withdrawn and carries nothing but its keys (NFR-LEGAL-07), and that the
 * cursor walks the list without repeating or losing a row.
 *
 * Isolation: every account here carries this run's own address domain, and the
 * spec filters what it asserts on down to those rows — the read is over the
 * whole customer book, and the stack has one.
 */

const ADMIN_EMAIL = 'e2e-customer-read-admin@example.com';
const PASSWORD = 'e2e-customer-read-password';

const R = Date.now().toString(36);
const TOKEN_NAME = `e2e customer read ${R}`;
const EMAIL_DOMAIN = `e2e-read-${R}.example`;

interface AccountRecord {
  id: string;
  sourceId: string | null;
  state: string;
  email: string | null;
  firstName: string | null;
  companyName: string | null;
  tierKey: string | null;
  updatedAt: string;
}

function sessionCookie(setCookie: string[] | undefined): string {
  const cookie = setCookie
    ?.find((c) => c.startsWith('session='))
    ?.split(';')[0];
  if (!cookie) throw new Error('expected a session cookie');
  return cookie;
}

describe('Outbound customer read (FR-ADM-18)', () => {
  let client: Client;
  let adminCookie: string;
  let token: string;
  let syncToken: string;

  const read = (params: Record<string, string | number> = {}, bearer = token) =>
    axios.get('/machine/customers/accounts', {
      params,
      headers: bearer ? { Authorization: `Bearer ${bearer}` } : {},
      validateStatus: () => true,
    });

  /** Only the accounts this spec made: the customer book is shared. */
  const mine = (accounts: AccountRecord[]) =>
    accounts.filter(
      (a) =>
        a.email?.endsWith(EMAIL_DOMAIN) ||
        a.sourceId?.startsWith(`read-${R}`) ||
        a.id === withdrawnId,
    );

  /** Walks every page so the cursor is exercised rather than assumed. */
  const readAll = async (limit: number) => {
    const all: AccountRecord[] = [];
    let cursor: string | null = null;
    // Bounded so a cursor that never advances fails the test rather than the
    // suite.
    for (let page = 0; page < 200; page++) {
      const res: {
        data: { accounts: AccountRecord[]; nextCursor: string | null };
      } = await read(cursor ? { limit, cursor } : { limit });
      all.push(...res.data.accounts);
      cursor = res.data.nextCursor;
      if (!cursor) return all;
    }
    throw new Error('the cursor never reached the end of the list');
  };

  let withdrawnId = '';

  const insertCustomer = async (
    n: number,
    over: { sourceId?: string | null; status?: string } = {},
  ) => {
    const { rows } = await client.query(
      `INSERT INTO users (email, "passwordHash", role, status, "sourceId", "firstName", "lastName")
       VALUES ($1, $2, 'user', $3, $4, 'Ada', 'Lovelace')
       RETURNING id`,
      [
        `read-${n}@${EMAIL_DOMAIN}`,
        await hash(PASSWORD),
        over.status ?? 'active',
        over.sourceId === undefined ? `read-${R}-${n}` : over.sourceId,
      ],
    );
    return rows[0].id as string;
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

    const issued = await axios.post(
      '/admin/api-tokens',
      { name: TOKEN_NAME, scopes: ['customer-read'] },
      { headers: { Cookie: adminCookie } },
    );
    token = issued.data.token;

    const writeOnly = await axios.post(
      '/admin/api-tokens',
      { name: `${TOKEN_NAME} write`, scopes: ['customer-sync'] },
      { headers: { Cookie: adminCookie } },
    );
    syncToken = writeOnly.data.token;

    await insertCustomer(1);
    // The account this route exists for: registered on the storefront, no
    // source key, invisible to the exchange until somebody outside sees it.
    await insertCustomer(2, { sourceId: null, status: 'pending' });
    await insertCustomer(3);
    // A closed account. Inserted in the shape deletion leaves behind — the
    // key kept, everything else cleared — rather than deleted through the
    // account API, which is its own spec's subject.
    withdrawnId = await insertCustomer(4, { status: 'anonymized' });
    await client.query(
      `UPDATE users
          SET email = concat('deleted-', id::text, '@deleted.invalid'),
              "firstName" = NULL, "lastName" = NULL, phone = NULL,
              "customerType" = NULL, "companyName" = NULL,
              "companyRegistrationId" = NULL, "tierId" = NULL
        WHERE id = $1`,
      [withdrawnId],
    );
  });

  afterAll(async () => {
    await client.query('DELETE FROM api_tokens WHERE name LIKE $1', [
      `${TOKEN_NAME}%`,
    ]);
    await client.query('DELETE FROM users WHERE email LIKE $1', [
      `%@${EMAIL_DOMAIN}`,
    ]);
    await client.query('DELETE FROM users WHERE id = $1', [withdrawnId]);
    await client.query('DELETE FROM users WHERE email = $1', [ADMIN_EMAIL]);
    await client.end();
  });

  describe('who may reach it', () => {
    it('refuses a request with no credential', async () => {
      expect((await read({}, '')).status).toBe(401);
    });

    /** Its own capability, and that is the point of it: reading the whole
     * customer book and writing to people's accounts are different powers. */
    it('refuses a customer-sync token', async () => {
      const res = await read({}, syncToken);
      expect(res.status).toBe(403);
      expect(res.data.code).toBe('insufficient-scope');
    });

    it('refuses an admin session on the machine route', async () => {
      const res = await axios.get('/machine/customers/accounts', {
        headers: { Cookie: adminCookie },
        validateStatus: () => true,
      });
      expect(res.status).toBe(401);
    });

    /**
     * Unlike every write in this area, and deliberately: the case this exists
     * for is the one where nobody has handed customers over yet, because that
     * is when the other system has to learn what is here.
     */
    it('answers while nobody owns customer accounts', async () => {
      const res = await read();
      expect(res.status).toBe(200);
      expect(Array.isArray(res.data.accounts)).toBe(true);
    });
  });

  describe('what it carries', () => {
    it('shows an account nobody has claimed, with no key at all', async () => {
      const accounts = mine(await readAll(200));
      const unclaimed = accounts.find((a) => a.email?.startsWith(`read-2@`));

      expect(unclaimed).toMatchObject({ sourceId: null, state: 'pending' });
      // The platform's own id is the only handle such an account has, which is
      // why it travels.
      expect(unclaimed?.id).toBeTruthy();
    });

    it('never lists staff', async () => {
      const accounts = await readAll(200);
      expect(accounts.some((a) => a.email === ADMIN_EMAIL)).toBe(false);
    });

    it('reports a closed account as withdrawn, and carries nothing of them', async () => {
      const accounts = await readAll(200);
      const withdrawn = accounts.find((a) => a.id === withdrawnId);

      expect(withdrawn).toBeDefined();
      expect(withdrawn?.state).toBe('withdrawn');
      // Not even the `deleted-…@deleted.invalid` placeholder the row still
      // carries for the staff list's benefit.
      expect(withdrawn).toMatchObject({
        email: null,
        firstName: null,
        companyName: null,
        tierKey: null,
      });
      // The key survives, which is what stops a later run recreating them.
      expect(withdrawn?.sourceId).toBe(`read-${R}-4`);
    });
  });

  describe('paging', () => {
    it('walks the whole list one small page at a time, without repeats', async () => {
      const wholeList = mine(await readAll(200));
      const inPieces = mine(await readAll(2));

      // Compared over this spec's own accounts: the read is over the shop's
      // whole customer book, and the other suites are writing to it. These
      // rows are made once in `beforeAll` and never touched again, so their
      // place in the ordering is fixed however busy the table is.
      expect(inPieces.map((a) => a.id)).toEqual(wholeList.map((a) => a.id));
      expect(new Set(inPieces.map((a) => a.id)).size).toBe(inPieces.length);
    });

    it('reads only what has moved since a moment', async () => {
      const all = await readAll(200);
      const last = all.at(-1);
      expect(last).toBeDefined();

      const res = await read({ since: last?.updatedAt ?? '', limit: 200 });
      expect(res.status).toBe(200);
      // Inclusive, so the account it names is in the answer — and nothing
      // older than it is, which is the property a scheduled puller relies on.
      const back: AccountRecord[] = res.data.accounts;
      expect(back.some((a) => a.id === last?.id)).toBe(true);
      expect(back.every((a) => a.updatedAt >= (last?.updatedAt ?? ''))).toBe(
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
