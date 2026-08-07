import { hash } from '@node-rs/argon2';
import { bootstrapAdmin } from '@b2b-catalog-platform/seed';
import axios from 'axios';
import { Client } from 'pg';
import { requireEnv } from '../support/env';

const EMAIL = 'e2e-bootstrap-admin@example.com';
const PASSWORD = 'bootstrap-password-1';

describe('bootstrapAdmin (create-if-missing)', () => {
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
    const firstHash = await hash(PASSWORD);
    const created = await bootstrapAdmin(client, EMAIL, firstHash);
    expect(created).toBe(true);

    // A second run with different credentials must be a no-op — never clobber
    // an admin who may have changed their password since the first deploy.
    const secondHash = await hash('a-completely-different-password');
    const createdAgain = await bootstrapAdmin(client, EMAIL, secondHash);
    expect(createdAgain).toBe(false);

    const { rows } = await client.query(
      'SELECT "passwordHash", role FROM users WHERE email = $1',
      [EMAIL],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].passwordHash).toBe(firstHash); // original preserved
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
