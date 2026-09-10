import { hash } from '@node-rs/argon2';
import axios from 'axios';
import { Client } from 'pg';
import { requireEnv } from '../support/env';

const ADMIN_EMAIL = 'e2e-api-tokens-admin@example.com';
const MANAGER_EMAIL = 'e2e-api-tokens-manager@example.com';
const PASSWORD = 'e2e-api-tokens-password';
const TOKEN_NAME = 'e2e machine token';

function sessionCookie(setCookie: string[] | undefined): string | undefined {
  return setCookie?.find((c) => c.startsWith('session='))?.split(';')[0];
}

async function login(email: string): Promise<string> {
  const res = await axios.post('/auth/login', { email, password: PASSWORD });
  const cookie = sessionCookie(res.headers['set-cookie']);
  if (!cookie) throw new Error('login did not return a session cookie');
  return cookie;
}

/**
 * Machine tokens (NFR-SEC-09) end to end: the two authentication paths meet
 * here and nowhere else, so the thing worth proving against a real HTTP stack
 * is that neither of them substitutes for the other.
 */
describe('machine tokens', () => {
  let client: Client;
  let adminCookie: string;

  beforeAll(async () => {
    client = new Client({ connectionString: requireEnv('DATABASE_URL') });
    await client.connect();
    const passwordHash = await hash(PASSWORD);
    for (const [email, role] of [
      [ADMIN_EMAIL, 'admin'],
      [MANAGER_EMAIL, 'manager'],
    ] as const) {
      await client.query('DELETE FROM users WHERE email = $1', [email]);
      await client.query(
        `INSERT INTO users (email, "passwordHash", role, status)
         VALUES ($1, $2, $3, 'active')`,
        [email, passwordHash, role],
      );
    }
    adminCookie = await login(ADMIN_EMAIL);
  });

  afterAll(async () => {
    await client.query('DELETE FROM api_tokens WHERE name LIKE $1', [
      `${TOKEN_NAME}%`,
    ]);
    await client.query('DELETE FROM users WHERE email = ANY($1)', [
      [ADMIN_EMAIL, MANAGER_EMAIL],
    ]);
    await client.end();
  });

  const create = (name: string, cookie = adminCookie) =>
    axios.post(
      '/admin/api-tokens',
      { name, scopes: ['catalog-sync'] },
      { headers: { Cookie: cookie }, validateStatus: () => true },
    );

  it('refuses to issue a token without a session', async () => {
    const res = await axios.post(
      '/admin/api-tokens',
      { name: TOKEN_NAME, scopes: ['catalog-sync'] },
      { validateStatus: () => true },
    );
    expect(res.status).toBe(401);
  });

  it('refuses to issue a token to a manager', async () => {
    const res = await create(
      `${TOKEN_NAME} manager`,
      await login(MANAGER_EMAIL),
    );
    expect(res.status).toBe(403);
  });

  it('refuses an unknown capability', async () => {
    const res = await axios.post(
      '/admin/api-tokens',
      { name: TOKEN_NAME, scopes: ['everything'] },
      { headers: { Cookie: adminCookie }, validateStatus: () => true },
    );
    expect(res.status).toBe(400);
  });

  /** A token allowed nothing could only mislead whoever reads the list. */
  it('refuses a token with no capabilities at all', async () => {
    const res = await axios.post(
      '/admin/api-tokens',
      { name: TOKEN_NAME, scopes: [] },
      { headers: { Cookie: adminCookie }, validateStatus: () => true },
    );
    expect(res.status).toBe(400);
  });

  it('issues a token, returns its value once, and never stores it in the clear', async () => {
    const res = await create(`${TOKEN_NAME} value`);
    expect(res.status).toBe(201);
    expect(res.data.token.startsWith(`${res.data.prefix}.`)).toBe(true);
    expect(res.data.createdBy).toBe(ADMIN_EMAIL);
    expect(res.data.lastUsedAt).toBeNull();

    // The value is not in the row, and the list never carries one.
    const stored = await client.query(
      'SELECT "tokenHash" FROM api_tokens WHERE id = $1',
      [res.data.id],
    );
    expect(stored.rows[0].tokenHash).not.toContain(res.data.token);

    const list = await axios.get('/admin/api-tokens', {
      headers: { Cookie: adminCookie },
    });
    const listed = list.data.tokens.find(
      (t: { id: string }) => t.id === res.data.id,
    );
    expect(listed).toBeDefined();
    expect(listed.token).toBeUndefined();
  });

  it('authenticates a machine route and records the use', async () => {
    const created = await create(`${TOKEN_NAME} use`);
    const res = await axios.get('/machine/token', {
      headers: { Authorization: `Bearer ${created.data.token}` },
    });
    expect(res.status).toBe(200);
    expect(res.data).toEqual({
      name: `${TOKEN_NAME} use`,
      scopes: ['catalog-sync'],
    });

    const list = await axios.get('/admin/api-tokens', {
      headers: { Cookie: adminCookie },
    });
    const listed = list.data.tokens.find(
      (t: { id: string }) => t.id === created.data.id,
    );
    expect(listed.lastUsedAt).not.toBeNull();
  });

  /** The discipline of the machine path: a session is not a second way in. */
  it('refuses a machine route to an admin session', async () => {
    const res = await axios.get('/machine/token', {
      headers: { Cookie: adminCookie },
      validateStatus: () => true,
    });
    expect(res.status).toBe(401);
  });

  it('refuses a machine route with no credential, and with a wrong one', async () => {
    const bare = await axios.get('/machine/token', {
      validateStatus: () => true,
    });
    expect(bare.status).toBe(401);

    const wrong = await axios.get('/machine/token', {
      headers: { Authorization: 'Bearer nothing.here' },
      validateStatus: () => true,
    });
    expect(wrong.status).toBe(401);
    expect(wrong.data.code).toBe('not-authenticated');
  });

  it('refuses a token presented as anything but a bearer', async () => {
    const created = await create(`${TOKEN_NAME} scheme`);
    const res = await axios.get('/machine/token', {
      headers: { Authorization: `Basic ${created.data.token}` },
      validateStatus: () => true,
    });
    expect(res.status).toBe(401);
  });

  it('refuses the token on its next request once revoked', async () => {
    const created = await create(`${TOKEN_NAME} revoke`);
    const auth = { Authorization: `Bearer ${created.data.token}` };
    expect((await axios.get('/machine/token', { headers: auth })).status).toBe(
      200,
    );

    const revoked = await axios.post(
      `/admin/api-tokens/${created.data.id}/revoke`,
      {},
      { headers: { Cookie: adminCookie } },
    );
    expect(revoked.data.revokedAt).not.toBeNull();

    const after = await axios.get('/machine/token', {
      headers: auth,
      validateStatus: () => true,
    });
    expect(after.status).toBe(401);
  });

  it('answers 404 for revoking a token that does not exist', async () => {
    const res = await axios.post(
      '/admin/api-tokens/3f1c2b4a-5d6e-4f70-8a91-b2c3d4e5f607/revoke',
      {},
      { headers: { Cookie: adminCookie }, validateStatus: () => true },
    );
    expect(res.status).toBe(404);
    expect(res.data.code).toBe('api-token-not-found');
  });
});
