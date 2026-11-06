import { Client } from 'pg';
import { requireEnv } from '../support/env';

const SUFFIX = Math.random().toString(36).slice(2, 10);
const email = (name: string) => `e2e-identity-${name}-${SUFFIX}@example.com`;

/**
 * What the database holds for every writer, raw SQL included (ADR 0074): an
 * account is an identity, and the fields that belong to a customer or a
 * company stay off the accounts they do not describe.
 */
describe('identities and account checks', () => {
  let client: Client;

  const insertUser = (columns: Record<string, unknown>) => {
    const all = { passwordHash: 'x', status: 'active', ...columns };
    const names = Object.keys(all).map((name) => `"${name}"`);
    const values = Object.keys(all).map((_, i) => `$${i + 1}`);
    return client.query<{ id: string }>(
      `INSERT INTO users (${names.join(', ')}) VALUES (${values.join(', ')}) RETURNING id`,
      Object.values(all),
    );
  };

  beforeAll(async () => {
    client = new Client({ connectionString: requireEnv('DATABASE_URL') });
    await client.connect();
  });

  afterAll(async () => {
    await client.query('DELETE FROM users WHERE email LIKE $1', [
      `e2e-identity-%-${SUFFIX}@example.com`,
    ]);
    await client.end();
  });

  it('gives every new account its identity', async () => {
    const { rows } = await insertUser({ email: email('new'), role: 'user' });

    const identity = await client.query(
      'SELECT id FROM identities WHERE id = $1',
      [rows[0].id],
    );
    expect(identity.rows).toHaveLength(1);
  });

  it('takes the identity along when an account is deleted, clearing what named it', async () => {
    const { rows } = await insertUser({ email: email('gone'), role: 'admin' });
    const id = rows[0].id;
    const change = await client.query<{ id: string }>(
      `INSERT INTO setting_changes (kind, enabled, "changedBy") VALUES ('maintenance', false, $1) RETURNING id`,
      [id],
    );

    await client.query('DELETE FROM users WHERE id = $1', [id]);

    const identity = await client.query(
      'SELECT id FROM identities WHERE id = $1',
      [id],
    );
    expect(identity.rows).toHaveLength(0);
    const named = await client.query(
      'SELECT "changedBy" FROM setting_changes WHERE id = $1',
      [change.rows[0].id],
    );
    expect(named.rows[0].changedBy).toBeNull();
    await client.query('DELETE FROM setting_changes WHERE id = $1', [
      change.rows[0].id,
    ]);
  });

  it('refuses a source key on a staff account', async () => {
    await expect(
      insertUser({
        email: email('staff-key'),
        role: 'manager',
        sourceId: `e2e-identity-${SUFFIX}`,
      }),
    ).rejects.toThrow('users_customer_only_fields');
  });

  it('refuses company fields on a person', async () => {
    await expect(
      insertUser({
        email: email('person'),
        role: 'user',
        customerType: 'person',
        companyRegistrationId: 'HRB 1',
      }),
    ).rejects.toThrow('users_company_fields_on_companies');
  });

  it('keeps a company that has no name, as early registrations had none', async () => {
    await expect(
      insertUser({
        email: email('company'),
        role: 'user',
        customerType: 'company',
        companyRegistrationId: 'HRB 2',
      }),
    ).resolves.toBeDefined();
  });
});
