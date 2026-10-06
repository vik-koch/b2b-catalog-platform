import { hash } from '@node-rs/argon2';
import axios from 'axios';
import { Client } from 'pg';
import { requireEnv } from '../support/env';
import { deleteMatching } from '../support/mailpit';

const SUFFIX = Math.random().toString(36).slice(2, 10);
const ADMIN_EMAIL = `e2e-destruction-admin-${SUFFIX}@example.com`;
const MANAGER_EMAIL = `e2e-destruction-manager-${SUFFIX}@example.com`;
const LEAVER_EMAIL = `e2e-destruction-leaver-${SUFFIX}@example.com`;
const REQUESTER_EMAIL = `e2e-destruction-requester-${SUFFIX}@example.com`;
const REGISTRANT_EMAIL = `e2e-destruction-registrant-${SUFFIX}@example.com`;
const PASSWORD = 'e2e-destruction-password';

const everyone = [
  ADMIN_EMAIL,
  MANAGER_EMAIL,
  LEAVER_EMAIL,
  REQUESTER_EMAIL,
  REGISTRANT_EMAIL,
];

/**
 * The record each destruction of personal data leaves (NFR-LEGAL-12): written
 * by the act itself, naming the person by id and never by what went.
 */
describe('destruction records', () => {
  let client: Client;
  let adminId: string;
  let adminCookie: string;
  let managerId: string;
  let managerCookie: string;
  let leaverId: string;
  const subjects: string[] = [];

  const signIn = async (email: string) => {
    const res = await axios.post(
      '/auth/login',
      { email, password: PASSWORD },
      { validateStatus: () => true },
    );
    const cookie = (res.headers['set-cookie'] as string[] | undefined)
      ?.find((c) => c.startsWith('session='))
      ?.split(';')[0];
    if (!cookie) throw new Error(`could not sign in as ${email}`);
    return cookie;
  };

  const seedUser = async (
    email: string,
    role: string,
    status = 'active',
  ): Promise<string> => {
    const { rows } = await client.query(
      `INSERT INTO users (email, "passwordHash", role, status, "firstName", "lastName", "passwordSetAt")
       VALUES ($1, $2, $3, $4, 'Jane', 'Doe', now())
       RETURNING id`,
      [email, await hash(PASSWORD), role, status],
    );
    subjects.push(rows[0].id);
    return rows[0].id;
  };

  const recordsOf = async (subjectId: string) =>
    (
      await client.query(
        `SELECT subject, categories, reason, "destroyedBy", "destroyedByEmail"
           FROM destruction_records WHERE "subjectId" = $1`,
        [subjectId],
      )
    ).rows;

  beforeAll(async () => {
    client = new Client({ connectionString: requireEnv('DATABASE_URL') });
    await client.connect();
    adminId = await seedUser(ADMIN_EMAIL, 'admin');
    managerId = await seedUser(MANAGER_EMAIL, 'manager');
    adminCookie = await signIn(ADMIN_EMAIL);
    managerCookie = await signIn(MANAGER_EMAIL);
  });

  afterAll(async () => {
    // Deleting is what a record's own retention ends in, so it stays allowed.
    await client.query(
      'DELETE FROM destruction_records WHERE "subjectId" = ANY($1)',
      [subjects],
    );
    await client.query('DELETE FROM users WHERE email = ANY($1)', [everyone]);
    await client.end();
    await deleteMatching(`"${LEAVER_EMAIL}"`);
    await deleteMatching(`"${REQUESTER_EMAIL}"`);
  });

  it("records a holder's own deletion as their request, without their address", async () => {
    const id = (leaverId = await seedUser(LEAVER_EMAIL, 'user'));
    const cookie = await signIn(LEAVER_EMAIL);

    const res = await axios.post(
      '/account/delete',
      { password: PASSWORD },
      { headers: { Cookie: cookie }, validateStatus: () => true },
    );
    expect(res.status).toBeLessThan(300);

    expect(await recordsOf(id)).toEqual([
      {
        subject: 'account',
        categories: [
          'account-details',
          'addresses',
          'order-details',
          'order-documents',
        ],
        reason: 'request',
        destroyedBy: id,
        destroyedByEmail: null,
      },
    ]);
  });

  it('records an admin deletion with the reason given and the admin', async () => {
    const id = await seedUser(REQUESTER_EMAIL, 'user');

    const res = await axios.post(
      `/admin/users/${id}/deletion`,
      { reason: 'consent-withdrawn' },
      { headers: { Cookie: adminCookie }, validateStatus: () => true },
    );
    expect(res.status).toBe(200);

    expect(await recordsOf(id)).toEqual([
      expect.objectContaining({
        reason: 'consent-withdrawn',
        destroyedBy: adminId,
        destroyedByEmail: ADMIN_EMAIL,
      }),
    ]);
  });

  // A manager may decline as well; the row is gone, the record is not.
  it('records a declined registration under the id it had', async () => {
    const id = await seedUser(REGISTRANT_EMAIL, 'user', 'pending');

    const res = await axios.delete(`/admin/users/${id}`, {
      headers: { Cookie: managerCookie },
      validateStatus: () => true,
    });
    expect(res.status).toBe(200);

    expect(await recordsOf(id)).toEqual([
      {
        subject: 'account',
        categories: ['account-details', 'addresses'],
        reason: 'registration-declined',
        destroyedBy: managerId,
        destroyedByEmail: MANAGER_EMAIL,
      },
    ]);
  });

  it('writes nothing when a deletion is refused', async () => {
    const res = await axios.post(
      `/admin/users/${adminId}/deletion`,
      { reason: 'request' },
      { headers: { Cookie: adminCookie }, validateStatus: () => true },
    );
    expect(res.data.code).toBe('self-delete');

    expect(await recordsOf(adminId)).toEqual([]);
  });

  it('is never changed', async () => {
    await expect(
      client.query(
        `UPDATE destruction_records SET reason = 'request' WHERE "subjectId" = $1`,
        [leaverId],
      ),
    ).rejects.toThrow('Rows of destruction_records are never changed');
  });
});
