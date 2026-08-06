import axios from 'axios';
import { Client } from 'pg';
import { requireEnv } from '../support/env';
import { deleteMatching, messagesMatching } from '../support/mailpit';

const NEW_EMAIL = 'e2e-registrant@example.com';
const KNOWN_EMAIL = 'e2e-known-registrant@example.com';

// Scoped to this suite's own mail — the staff inbox also receives inquiries
// from another suite running at the same time.
const REGISTRANT_MAIL = `to:"${NEW_EMAIL}"`;
const STAFF_MAIL = `to:"${requireEnv(
  'MAIL_STAFF_TO',
)}" subject:"New registration"`;
// Two queries, not one combined: Mailpit's search has no OR and no grouping,
// and a parenthesised query silently matches nothing — which would make every
// "no mail was sent" assertion below pass for the wrong reason.
const OUR_MAIL = [REGISTRANT_MAIL, STAFF_MAIL];

const clearOurMail = () => Promise.all(OUR_MAIL.map(deleteMatching));

/** Asserts this suite's registration produced no mail of either kind. */
async function expectNoMail(): Promise<void> {
  for (const query of OUR_MAIL) {
    expect(await messagesMatching(query)).toHaveLength(0);
  }
}

const register = (body: unknown) =>
  axios.post('/auth/register', body, { validateStatus: () => true });

/**
 * FR-AUTH-01 end to end. The rule under test throughout: the response is the
 * same whatever happened, and what actually happened shows up in the database
 * and the mail sink instead.
 */
describe('POST /auth/register', () => {
  let client: Client;

  const rowsFor = async (email: string) => {
    const { rows } = await client.query(
      'SELECT status, role, "tierId", "approvedAt" FROM users WHERE email = $1',
      [email],
    );
    return rows;
  };

  beforeAll(async () => {
    client = new Client({ connectionString: requireEnv('DATABASE_URL') });
    await client.connect();
    await client.query('DELETE FROM users WHERE email = ANY($1)', [
      [NEW_EMAIL, KNOWN_EMAIL],
    ]);
    // An address that already has an account, for the no-enumeration case.
    // Deliberately staff: suites share one database and run in parallel, and a
    // long-lived customer row would drift the account counts another suite
    // asserts. Registration does not care what role the existing account has.
    await client.query(
      `INSERT INTO users (email, "passwordHash", role, status)
       VALUES ($1, $2, 'manager', 'active')`,
      [KNOWN_EMAIL, '$argon2id$placeholder'],
    );
  });

  afterAll(async () => {
    await client.query('DELETE FROM users WHERE email = ANY($1)', [
      [NEW_EMAIL, KNOWN_EMAIL],
    ]);
    await client.end();
  });

  beforeEach(async () => {
    await clearOurMail();
    await client.query('DELETE FROM users WHERE email = $1', [NEW_EMAIL]);
  });

  it('creates a pending, untiered account and mails the registrant and the shop', async () => {
    const res = await register({ email: NEW_EMAIL });

    expect(res.status).toBe(200);
    expect(res.data).toEqual({ ok: true });

    expect(await rowsFor(NEW_EMAIL)).toEqual([
      { status: 'pending', role: 'user', tierId: null, approvedAt: null },
    ]);

    expect(await messagesMatching(REGISTRANT_MAIL)).toHaveLength(1);
    expect(await messagesMatching(STAFF_MAIL)).toHaveLength(1);
  });

  // The account exists but is not usable yet: approval is what makes it one.
  it('leaves the new account unable to sign in', async () => {
    await register({ email: NEW_EMAIL });

    const res = await axios.post(
      '/auth/login',
      { email: NEW_EMAIL, password: 'anything-at-all' },
      { validateStatus: () => true },
    );

    expect(res.status).toBe(401);
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('answers a known address identically, without a second row or a mail', async () => {
    const res = await register({ email: KNOWN_EMAIL });

    expect(res.status).toBe(200);
    expect(res.data).toEqual({ ok: true });
    expect(await rowsFor(KNOWN_EMAIL)).toHaveLength(1);
    await expectNoMail();
  });

  it('normalizes the address, so a differently-cased retry is not a new account', async () => {
    await register({ email: NEW_EMAIL });
    await register({ email: NEW_EMAIL.toUpperCase() });

    expect(await rowsFor(NEW_EMAIL)).toHaveLength(1);
  });

  it('silently drops a submission with the honeypot filled', async () => {
    const res = await register({
      email: NEW_EMAIL,
      website: 'http://spam.example',
    });

    expect(res.status).toBe(200);
    expect(await rowsFor(NEW_EMAIL)).toHaveLength(0);
    await expectNoMail();
  });

  it('rejects a malformed address with a 400 and writes nothing', async () => {
    const res = await register({ email: 'not-an-address' });

    expect(res.status).toBe(400);
    await expectNoMail();
  });

  it('rejects an unknown field on the submission (strict contract)', async () => {
    const res = await register({ email: NEW_EMAIL, role: 'admin' });

    expect(res.status).toBe(400);
    expect(await rowsFor(NEW_EMAIL)).toHaveLength(0);
  });
});
