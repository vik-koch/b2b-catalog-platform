import { hash } from '@node-rs/argon2';
import axios from 'axios';
import { Client } from 'pg';
import { requireEnv } from '../support/env';

const TEST_EMAIL = 'e2e-admin@example.com';
const TEST_PASSWORD = 'e2e-admin-password';
const NEW_PASSWORD = 'e2e-admin-new-password';

// Pull the `session=<jwt>` pair out of a Set-Cookie header, ready to send back
// as a Cookie header (axios does not keep a cookie jar).
function sessionCookie(setCookie: string[] | undefined): string | undefined {
  return setCookie?.find((c) => c.startsWith('session='))?.split(';')[0];
}

function login(password: string) {
  return axios.post(
    '/auth/login',
    { email: TEST_EMAIL, password },
    { validateStatus: () => true },
  );
}

describe('auth (session cookie)', () => {
  let client: Client;
  let userId: string;

  beforeAll(async () => {
    client = new Client({ connectionString: requireEnv('DATABASE_URL') });
    await client.connect();
    // Idempotent: clear any leftover from a previous run, then seed a known admin.
    await client.query('DELETE FROM users WHERE email = $1', [TEST_EMAIL]);
    const passwordHash = await hash(TEST_PASSWORD);
    const { rows } = await client.query(
      `INSERT INTO users (email, "passwordHash", role)
       VALUES ($1, $2, 'admin') RETURNING id`,
      [TEST_EMAIL, passwordHash],
    );
    userId = rows[0].id;
  });

  afterAll(async () => {
    await client.query('DELETE FROM users WHERE email = $1', [TEST_EMAIL]);
    await client.end();
  });

  it('rejects a wrong password with 401 and no cookie', async () => {
    const res = await login('wrong-password');

    expect(res.status).toBe(401);
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('returns an identical 401 for an unknown email (no user enumeration)', async () => {
    const unknown = await axios.post(
      '/auth/login',
      { email: 'nobody-here@example.com', password: 'whatever' },
      { validateStatus: () => true },
    );
    const wrongPassword = await login('also-wrong');

    expect(unknown.status).toBe(401);
    expect(unknown.headers['set-cookie']).toBeUndefined();
    // Same status and body as a wrong password for a real account, so the
    // response can't be used to discover which emails have accounts.
    expect(unknown.status).toBe(wrongPassword.status);
    expect(unknown.data).toEqual(wrongPassword.data);
  });

  it('logs in, returns the identity, and sets an httpOnly session cookie', async () => {
    const res = await login(TEST_PASSWORD);

    expect(res.status).toBe(200);
    expect(res.data).toEqual({ id: userId, email: TEST_EMAIL, role: 'admin' });
    const cookie = res.headers['set-cookie']?.find((c) =>
      c.startsWith('session='),
    );
    expect(cookie).toMatch(/HttpOnly/i);
  });

  it('rejects /auth/me without a cookie', async () => {
    const res = await axios.get('/auth/me', { validateStatus: () => true });

    expect(res.status).toBe(401);
  });

  it('returns the current user from /auth/me with the cookie', async () => {
    const cookie = sessionCookie(
      (await login(TEST_PASSWORD)).headers['set-cookie'],
    );

    const res = await axios.get('/auth/me', { headers: { Cookie: cookie } });

    expect(res.status).toBe(200);
    expect(res.data).toEqual({ id: userId, email: TEST_EMAIL, role: 'admin' });
  });

  it('logout responds 200 and clears the session cookie', async () => {
    const res = await axios.post(
      '/auth/logout',
      {},
      { validateStatus: () => true },
    );

    expect(res.status).toBe(200);
    expect(
      res.headers['set-cookie']?.some((c) => c.startsWith('session=')),
    ).toBe(true);
  });

  it('change-password rejects a wrong current, then rotates and kills old sessions', async () => {
    const cookie = sessionCookie(
      (await login(TEST_PASSWORD)).headers['set-cookie'],
    );

    const wrong = await axios.post(
      '/auth/change-password',
      { currentPassword: 'not-it', newPassword: NEW_PASSWORD },
      { headers: { Cookie: cookie }, validateStatus: () => true },
    );
    expect(wrong.status).toBe(400);

    const ok = await axios.post(
      '/auth/change-password',
      { currentPassword: TEST_PASSWORD, newPassword: NEW_PASSWORD },
      { headers: { Cookie: cookie }, validateStatus: () => true },
    );
    expect(ok.status).toBe(200);

    // The old cookie's tokenVersion is now stale -> rejected.
    const stale = await axios.get('/auth/me', {
      headers: { Cookie: cookie },
      validateStatus: () => true,
    });
    expect(stale.status).toBe(401);

    // The new password works.
    expect((await login(NEW_PASSWORD)).status).toBe(200);
  });
});
