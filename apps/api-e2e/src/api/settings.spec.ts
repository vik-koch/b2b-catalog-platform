import { hash } from '@node-rs/argon2';
import axios from 'axios';
import { Client } from 'pg';
import { requireEnv } from '../support/env';

const ADMIN_EMAIL = 'e2e-settings-admin@example.com';
const USER_EMAIL = 'e2e-settings-user@example.com';
const PASSWORD = 'e2e-settings-password';

function sessionCookie(setCookie: string[] | undefined): string | undefined {
  return setCookie?.find((c) => c.startsWith('session='))?.split(';')[0];
}

async function login(email: string): Promise<string> {
  const res = await axios.post('/auth/login', { email, password: PASSWORD });
  const cookie = sessionCookie(res.headers['set-cookie']);
  if (!cookie) throw new Error('login did not return a session cookie');
  return cookie;
}

// Note: the maintenance ON path (503 for the public, admin-session bypass, the
// Retry-After header) is covered by the guard unit test — MaintenanceGuard.spec.
// It is deliberately not exercised here: the api-e2e specs share one API process
// and run in parallel, so turning the gate on globally would 503 the other
// suites' public requests. These tests stay parallel-safe by never enabling it.
describe('settings (maintenance toggle)', () => {
  let client: Client;

  beforeAll(async () => {
    client = new Client({ connectionString: requireEnv('DATABASE_URL') });
    await client.connect();
    const passwordHash = await hash(PASSWORD);
    for (const [email, role] of [
      [ADMIN_EMAIL, 'admin'],
      [USER_EMAIL, 'user'],
    ] as const) {
      await client.query('DELETE FROM users WHERE email = $1', [email]);
      await client.query(
        `INSERT INTO users (email, "passwordHash", role) VALUES ($1, $2, $3)`,
        [email, passwordHash, role],
      );
    }
  });

  afterAll(async () => {
    await client.query('DELETE FROM users WHERE email = ANY($1)', [
      [ADMIN_EMAIL, USER_EMAIL],
    ]);
    await client.end();
  });

  it('exposes the public maintenance check without a session', async () => {
    const res = await axios.get('/maintenance', {
      validateStatus: () => true,
    });
    expect(res.status).toBe(200);
    expect(res.data).toEqual({ enabled: false });
  });

  it('rejects reading the toggle without a session', async () => {
    const res = await axios.get('/settings/maintenance', {
      validateStatus: () => true,
    });
    expect(res.status).toBe(401);
  });

  it('rejects a non-admin reading the toggle', async () => {
    const cookie = await login(USER_EMAIL);
    const res = await axios.get('/settings/maintenance', {
      headers: { Cookie: cookie },
      validateStatus: () => true,
    });
    expect(res.status).toBe(403);
  });

  it('returns the current toggle to an admin (off by default)', async () => {
    const cookie = await login(ADMIN_EMAIL);
    const res = await axios.get('/settings/maintenance', {
      headers: { Cookie: cookie },
    });
    expect(res.status).toBe(200);
    expect(res.data.enabled).toBe(false);
    expect(typeof res.data.updatedAt).toBe('string');
  });

  it('rejects a non-admin flipping the toggle', async () => {
    const cookie = await login(USER_EMAIL);
    const res = await axios.put(
      '/settings/maintenance',
      { enabled: true },
      { headers: { Cookie: cookie }, validateStatus: () => true },
    );
    expect(res.status).toBe(403);
    // State is unchanged: an admin still reads it as off.
    const adminCookie = await login(ADMIN_EMAIL);
    const check = await axios.get('/settings/maintenance', {
      headers: { Cookie: adminCookie },
    });
    expect(check.data.enabled).toBe(false);
  });

  it('rejects an unknown field on the toggle body (strict contract)', async () => {
    const cookie = await login(ADMIN_EMAIL);
    const res = await axios.put(
      '/settings/maintenance',
      { enabled: false, sneaky: true },
      { headers: { Cookie: cookie }, validateStatus: () => true },
    );
    expect(res.status).toBe(400);
  });

  it('accepts an admin writing the toggle and echoes the new state', async () => {
    const cookie = await login(ADMIN_EMAIL);
    // Writing `false` is idempotent and keeps the gate off, so this stays
    // parallel-safe while still exercising the real write path and cache update.
    const res = await axios.put(
      '/settings/maintenance',
      { enabled: false },
      { headers: { Cookie: cookie } },
    );
    expect(res.status).toBe(200);
    expect(res.data.enabled).toBe(false);
  });
});
