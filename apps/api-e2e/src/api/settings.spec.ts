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

// The gate's ON path is exercised here, which it could not be while these
// specs ran their files at once: the API process is shared, so a global switch
// turned on in one file 503s every other file's public requests. The suite now
// runs one file at a time (see vite.config.ts), which is what the ownership
// switch needed and what this inherited. Every test below restores the gate in
// a `finally`, and the suite leaves it off.
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
        `INSERT INTO users (email, "passwordHash", role, status)
         VALUES ($1, $2, $3, 'active')`,
        [email, passwordHash, role],
      );
    }
  });

  afterAll(async () => {
    // The runs point at the token, so they go first — the FK is `restrict`.
    await client.query('DELETE FROM sync_runs WHERE "tokenName" LIKE $1', [
      'e2e settings gate%',
    ]);
    await client.query('DELETE FROM api_tokens WHERE name LIKE $1', [
      'e2e settings gate%',
    ]);
    await client.query(
      'DELETE FROM setting_changes WHERE "changedByEmail" = $1',
      [ADMIN_EMAIL],
    );
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

  it('rejects reading the settings without a session', async () => {
    const res = await axios.get('/settings', {
      validateStatus: () => true,
    });
    expect(res.status).toBe(401);
  });

  it('rejects a non-admin reading the settings', async () => {
    const cookie = await login(USER_EMAIL);
    const res = await axios.get('/settings', {
      headers: { Cookie: cookie },
      validateStatus: () => true,
    });
    expect(res.status).toBe(403);
  });

  it('returns both switches to an admin in one read (off by default)', async () => {
    const cookie = await login(ADMIN_EMAIL);
    const res = await axios.get('/settings', {
      headers: { Cookie: cookie },
    });
    expect(res.status).toBe(200);
    expect(res.data.maintenanceEnabled).toBe(false);
    expect(res.data.ownedAreas).toEqual([]);
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
    const check = await axios.get('/settings', {
      headers: { Cookie: adminCookie },
    });
    expect(check.data.maintenanceEnabled).toBe(false);
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
    expect(res.data.maintenanceEnabled).toBe(false);
  });
  });
});
