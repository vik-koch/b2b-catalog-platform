import axios from 'axios';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Client } from 'pg';
import { requireEnv } from '../support/env';

const EMAIL = 'e2e-bootstrap-admin@example.com';
const PASSWORD = 'bootstrap-password-1';

const workspaceRoot = fileURLToPath(new URL('../../../..', import.meta.url));

/** Runs the one-shot a deployment runs, and returns what it logged. */
function bootstrapAdmin(password: string): string {
  return execFileSync('node', ['dist/apps/api/main.js'], {
    cwd: workspaceRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      RUN_MODE: 'bootstrap-admin',
      ADMIN_EMAIL: EMAIL,
      ADMIN_PASSWORD: password,
    },
  });
}

describe('bootstrap-admin one-shot (create-if-missing)', () => {
  let client: Client;

  beforeAll(async () => {
    client = new Client({ connectionString: requireEnv('DATABASE_URL') });
    await client.connect();
    await client.query('DELETE FROM users WHERE email = $1', [EMAIL]);
  });

  afterAll(async () => {
    await client.query('DELETE FROM users WHERE email = $1', [EMAIL]);
    await client.end();
  });

  it('creates the admin when absent, then leaves it untouched on re-run', async () => {
    expect(bootstrapAdmin(PASSWORD)).toContain(`created ${EMAIL}`);
    const { rows: first } = await client.query(
      'SELECT "passwordHash", role FROM users WHERE email = $1',
      [EMAIL],
    );

    // A second run with different credentials must be a no-op — never clobber
    // an admin who may have changed their password since the first deploy.
    expect(bootstrapAdmin('a-completely-different-password')).toContain(
      'already exists, left unchanged',
    );

    const { rows } = await client.query(
      'SELECT "passwordHash", role FROM users WHERE email = $1',
      [EMAIL],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].passwordHash).toBe(first[0].passwordHash); // original preserved
    expect(rows[0].role).toBe('admin');
  });

  it('creates an admin that can authenticate via the login endpoint', async () => {
    const res = await axios.post(
      '/auth/login',
      { email: EMAIL, password: PASSWORD },
      { validateStatus: () => true },
    );

    expect(res.status).toBe(200);
    expect(res.data).toEqual({
      id: expect.any(String),
      email: EMAIL,
      role: 'admin',
      // A config value rather than a person: nothing to greet it by, so the
      // greeting falls back to the address.
      firstName: null,
      // The deploy pipeline chose this password, not the admin, so the account
      // arrives flagged and the app insists on a change before anything else.
      mustChangePassword: true,
    });
  });
});
