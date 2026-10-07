import { hash } from '@node-rs/argon2';
import axios from 'axios';
import { Client } from 'pg';
import { consentVersion } from '../support/consent';
import { requireEnv } from '../support/env';
import { deleteMatching } from '../support/mailpit';

const SUFFIX = Math.random().toString(36).slice(2, 10);
const ADMIN_EMAIL = `e2e-consents-admin-${SUFFIX}@example.com`;
const MANAGER_EMAIL = `e2e-consents-manager-${SUFFIX}@example.com`;
const CUSTOMER_EMAIL = `e2e-consents-customer-${SUFFIX}@example.com`;
const INQUIRER_EMAIL = `e2e-consents-inquirer-${SUFFIX}@example.com`;
const REGISTRANT_EMAIL = `e2e-consents-registrant-${SUFFIX}@example.com`;
const RENAMED_EMAIL = `e2e-consents-renamed-${SUFFIX}@example.com`;
const LEAVER_EMAIL = `e2e-consents-leaver-${SUFFIX}@example.com`;
const REQUESTER_EMAIL = `e2e-consents-requester-${SUFFIX}@example.com`;
const PASSWORD = 'e2e-consents-password';
// As the contact form stores a number: the country code and the digits.
const INQUIRER_PHONE = `+4940${Math.floor(Math.random() * 1e7)}`;

const seeded = [ADMIN_EMAIL, MANAGER_EMAIL, CUSTOMER_EMAIL];
const holders = [
  INQUIRER_EMAIL,
  REGISTRANT_EMAIL,
  RENAMED_EMAIL,
  LEAVER_EMAIL,
  REQUESTER_EMAIL,
];

const get = (url: string, cookie?: string) =>
  axios.get(url, {
    headers: cookie ? { Cookie: cookie } : {},
    validateStatus: () => true,
  });

/**
 * Finding a person's consent records (NFR-LEGAL-09), and the rule that makes
 * them evidence: nothing changes one once it is written.
 */
describe('consent records', () => {
  let client: Client;
  let adminCookie: string;
  let managerCookie: string;
  let customerCookie: string;
  let registrantId: string;

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

  const seedUser = async (email: string, role: string): Promise<string> => {
    const { rows } = await client.query(
      `INSERT INTO users (email, "passwordHash", role, status, "firstName", "lastName", "passwordSetAt")
       VALUES ($1, $2, $3, 'active', 'Jane', 'Doe', now())
       RETURNING id`,
      [email, await hash(PASSWORD), role],
    );
    return rows[0].id;
  };

  beforeAll(async () => {
    client = new Client({ connectionString: requireEnv('DATABASE_URL') });
    await client.connect();

    await seedUser(ADMIN_EMAIL, 'admin');
    await seedUser(MANAGER_EMAIL, 'manager');
    await seedUser(CUSTOMER_EMAIL, 'user');
    adminCookie = await signIn(ADMIN_EMAIL);
    managerCookie = await signIn(MANAGER_EMAIL);
    customerCookie = await signIn(CUSTOMER_EMAIL);

    // One record of each purpose, given the way a visitor gives them.
    const inquiry = await axios.post('/inquiry', {
      name: 'Ida Inquirer',
      email: INQUIRER_EMAIL,
      phone: INQUIRER_PHONE,
      preferredContact: 'email',
      consentVersion: await consentVersion('contact'),
    });
    expect(inquiry.status).toBe(200);
    const registration = await axios.post('/auth/register', {
      email: REGISTRANT_EMAIL,
      firstName: 'Rita',
      lastName: 'Registrant',
      phone: '+494076543210',
      customerType: 'person',
      consentVersion: await consentVersion('account'),
    });
    expect(registration.status).toBe(200);
    const { rows } = await client.query(
      'SELECT id FROM users WHERE email = $1',
      [REGISTRANT_EMAIL],
    );
    registrantId = rows[0].id;
  });

  afterAll(async () => {
    // Deleting is what a record's retention ends in, so it stays allowed.
    await client.query('DELETE FROM consents WHERE email = ANY($1)', [holders]);
    await client.query('DELETE FROM users WHERE email = ANY($1)', [
      [...seeded, ...holders],
    ]);
    await client.end();
    await deleteMatching(`"${REGISTRANT_EMAIL}"`);
    await deleteMatching(`"${REQUESTER_EMAIL}"`);
  });

  describe('guards', () => {
    it('rejects an anonymous caller', async () => {
      expect(
        (await get(`/admin/consents?email=${INQUIRER_EMAIL}`)).status,
      ).toBe(401);
      expect((await get(`/admin/users/${registrantId}/consents`)).status).toBe(
        401,
      );
    });

    it('rejects a customer', async () => {
      expect(
        (await get(`/admin/consents?email=${INQUIRER_EMAIL}`, customerCookie))
          .status,
      ).toBe(403);
      expect(
        (await get(`/admin/users/${registrantId}/consents`, customerCookie))
          .status,
      ).toBe(403);
    });

    // The operator's to answer, so a manager is refused both outright.
    it('rejects a manager', async () => {
      expect(
        (await get(`/admin/consents?email=${INQUIRER_EMAIL}`, managerCookie))
          .status,
      ).toBe(403);
      expect(
        (await get(`/admin/users/${registrantId}/consents`, managerCookie))
          .status,
      ).toBe(403);
    });
  });

  describe('GET /admin/consents', () => {
    it("finds an inquiry's record by its address, with the wording ticked", async () => {
      const res = await get(
        `/admin/consents?email=${INQUIRER_EMAIL.toUpperCase()}`,
        adminCookie,
      );

      expect(res.status).toBe(200);
      expect(res.data.consents).toEqual([
        expect.objectContaining({
          purpose: 'contact',
          version: await consentVersion('contact'),
          label: expect.stringContaining('['),
          email: INQUIRER_EMAIL,
          phone: INQUIRER_PHONE,
          account: null,
        }),
      ]);
    });

    it('finds the same record by its phone number', async () => {
      const res = await get(
        `/admin/consents?phone=${encodeURIComponent(INQUIRER_PHONE)}`,
        adminCookie,
      );

      expect(res.status).toBe(200);
      expect(res.data.consents).toHaveLength(1);
      expect(res.data.consents[0].email).toBe(INQUIRER_EMAIL);
    });

    it('needs exactly one of the two', async () => {
      expect((await get('/admin/consents', adminCookie)).status).toBe(400);
      expect(
        (
          await get(
            `/admin/consents?email=${INQUIRER_EMAIL}&phone=${encodeURIComponent(INQUIRER_PHONE)}`,
            adminCookie,
          )
        ).status,
      ).toBe(400);
    });

    it('names the account a registration consented for', async () => {
      const res = await get(
        `/admin/consents?email=${REGISTRANT_EMAIL}`,
        adminCookie,
      );

      expect(res.data.consents).toEqual([
        expect.objectContaining({
          purpose: 'account',
          email: REGISTRANT_EMAIL,
          account: {
            id: registrantId,
            name: 'Registrant Rita',
            status: 'pending',
          },
        }),
      ]);
    });

    // The record keeps the address it was given with; the person asking may
    // have changed theirs since.
    it("finds an account's records under its current address too", async () => {
      await client.query('UPDATE users SET email = $1 WHERE id = $2', [
        RENAMED_EMAIL,
        registrantId,
      ]);
      try {
        const byNew = await get(
          `/admin/consents?email=${RENAMED_EMAIL}`,
          adminCookie,
        );
        const byOld = await get(
          `/admin/consents?email=${REGISTRANT_EMAIL}`,
          adminCookie,
        );

        expect(byNew.data.consents).toHaveLength(1);
        expect(byNew.data.consents[0].email).toBe(REGISTRANT_EMAIL);
        expect(byOld.data.consents).toHaveLength(1);
      } finally {
        await client.query('UPDATE users SET email = $1 WHERE id = $2', [
          REGISTRANT_EMAIL,
          registrantId,
        ]);
      }
    });

    it('answers an address nobody gave with an empty list', async () => {
      const res = await get(
        `/admin/consents?email=nobody-${SUFFIX}@example.com`,
        adminCookie,
      );

      expect(res.status).toBe(200);
      expect(res.data.consents).toEqual([]);
    });
  });

  describe('GET /admin/users/:id/consents', () => {
    it("lists a customer's records", async () => {
      const res = await get(
        `/admin/users/${registrantId}/consents`,
        adminCookie,
      );

      expect(res.status).toBe(200);
      expect(res.data.consents).toEqual([
        expect.objectContaining({
          purpose: 'account',
          email: REGISTRANT_EMAIL,
        }),
      ]);
    });
  });

  describe('a record never changes', () => {
    it('is refused by the database', async () => {
      await expect(
        client.query(`UPDATE consents SET phone = '+490' WHERE email = $1`, [
          INQUIRER_EMAIL,
        ]),
      ).rejects.toThrow('Rows of consents are never changed');
    });

    // The reason the record names its account without a foreign key: a
    // `SET NULL` on the removed account would be a change.
    it('outlives a declined registration, naming nobody but the address', async () => {
      const declined = await axios.delete(`/admin/users/${registrantId}`, {
        headers: { Cookie: adminCookie },
        validateStatus: () => true,
      });
      expect(declined.status).toBe(200);

      const res = await get(
        `/admin/consents?email=${REGISTRANT_EMAIL}`,
        adminCookie,
      );
      expect(res.data.consents).toEqual([
        expect.objectContaining({
          purpose: 'account',
          email: REGISTRANT_EMAIL,
          account: null,
          // The consent given on the form ends with the registration.
          withdrawal: expect.objectContaining({
            reason: 'registration-declined',
            enteredBy: null,
          }),
        }),
      ]);
    });
  });

  describe('POST /admin/consents/:id/withdrawal', () => {
    const post = (id: string, body: object, cookie: string) =>
      axios.post(`/admin/consents/${id}/withdrawal`, body, {
        headers: { Cookie: cookie },
        validateStatus: () => true,
      });
    const recordOf = async (email: string, purpose: string) => {
      const res = await get(`/admin/consents?email=${email}`, adminCookie);
      return res.data.consents.find(
        (r: { purpose: string }) => r.purpose === purpose,
      );
    };

    it('rejects a manager', async () => {
      const record = await recordOf(INQUIRER_EMAIL, 'contact');

      expect((await post(record.id, {}, managerCookie)).status).toBe(403);
    });

    it("enters an inquiry's withdrawal, with who entered it and how it came", async () => {
      const record = await recordOf(INQUIRER_EMAIL, 'contact');

      const res = await post(
        record.id,
        { note: ' Letter of 3 October ' },
        adminCookie,
      );

      expect(res.status).toBe(201);
      expect(res.data.withdrawal).toEqual({
        at: expect.any(String),
        reason: 'entered',
        enteredBy: ADMIN_EMAIL,
        note: 'Letter of 3 October',
      });
      // And it reads the same on the next search.
      expect((await recordOf(INQUIRER_EMAIL, 'contact')).withdrawal).toEqual(
        res.data.withdrawal,
      );
    });

    it('refuses a second withdrawal of the same record', async () => {
      const record = await recordOf(INQUIRER_EMAIL, 'contact');

      const res = await post(record.id, {}, adminCookie);

      expect(res.status).toBe(409);
      expect(res.data.code).toBe('consent-already-withdrawn');
    });

    it('refuses an account consent: deleting the account withdraws it', async () => {
      const record = await recordOf(REGISTRANT_EMAIL, 'account');

      const res = await post(record.id, {}, adminCookie);

      expect(res.status).toBe(409);
      expect(res.data.code).toBe('consent-ends-with-account');
    });

    it('answers an unknown record with 404', async () => {
      const res = await post(
        '00000000-0000-4000-8000-000000000000',
        {},
        adminCookie,
      );

      expect(res.status).toBe(404);
      expect(res.data.code).toBe('consent-not-found');
    });

    it('is never changed afterwards either', async () => {
      await expect(
        client.query(
          `UPDATE consent_withdrawals SET note = 'changed'
            WHERE "consentId" IN (SELECT id FROM consents WHERE email = $1)`,
          [INQUIRER_EMAIL],
        ),
      ).rejects.toThrow('Rows of consent_withdrawals are never changed');
    });
  });

  // The account consent ends with the account: the holder deleting it writes
  // the withdrawal in the same moment, and the record keeps the address.
  it('ends with the account its holder deletes', async () => {
    const leaverId = await seedUser(LEAVER_EMAIL, 'user');
    await client.query(
      `INSERT INTO consents (purpose, "pageVersionId", "userId", email)
       SELECT 'account', id, $1, $2 FROM page_versions
        WHERE slug = 'consent-account' ORDER BY version DESC LIMIT 1`,
      [leaverId, LEAVER_EMAIL],
    );
    const cookie = await signIn(LEAVER_EMAIL);

    const deleted = await axios.post(
      '/account/delete',
      { password: PASSWORD },
      { headers: { Cookie: cookie }, validateStatus: () => true },
    );
    expect(deleted.status).toBeLessThan(300);

    const res = await get(`/admin/consents?email=${LEAVER_EMAIL}`, adminCookie);
    expect(res.data.consents).toEqual([
      expect.objectContaining({
        email: LEAVER_EMAIL,
        account: expect.objectContaining({
          id: leaverId,
          status: 'anonymized',
        }),
        withdrawal: expect.objectContaining({ reason: 'account-deleted' }),
      }),
    ]);
    await client.query('DELETE FROM users WHERE id = $1', [leaverId]);
  });

  // FR-ADM-23: the same deletion, done by an admin on the person's request.
  // The withdrawal it writes keeps the deletion as its reason and names the
  // admin who did it.
  describe('POST /admin/users/:id/deletion', () => {
    const post = (id: string, cookie: string, reason = 'consent-withdrawn') =>
      axios.post(
        `/admin/users/${id}/deletion`,
        { reason },
        { headers: { Cookie: cookie }, validateStatus: () => true },
      );

    it('rejects a manager', async () => {
      const id = await seedUser(REQUESTER_EMAIL, 'user');
      try {
        expect((await post(id, managerCookie)).status).toBe(403);
      } finally {
        await client.query('DELETE FROM users WHERE id = $1', [id]);
      }
    });

    // Its own row: the registrant above has been declined by now.
    it('refuses a pending registration: it is declined instead', async () => {
      const id = await seedUser(REQUESTER_EMAIL, 'user');
      await client.query(`UPDATE users SET status = 'pending' WHERE id = $1`, [
        id,
      ]);
      try {
        const res = await post(id, adminCookie);

        expect(res.status).toBe(409);
        expect(res.data.code).toBe('account-pending');
      } finally {
        await client.query('DELETE FROM users WHERE id = $1', [id]);
      }
    });

    it("refuses the admin's own account", async () => {
      const { rows } = await client.query(
        'SELECT id FROM users WHERE email = $1',
        [ADMIN_EMAIL],
      );

      const res = await post(rows[0].id, adminCookie);

      expect(res.status).toBe(409);
      expect(res.data.code).toBe('self-delete');
    });

    it('anonymizes the account and names the admin on its withdrawal', async () => {
      const id = await seedUser(REQUESTER_EMAIL, 'user');
      await client.query(
        `INSERT INTO consents (purpose, "pageVersionId", "userId", email)
         SELECT 'account', id, $1, $2 FROM page_versions
          WHERE slug = 'consent-account' ORDER BY version DESC LIMIT 1`,
        [id, REQUESTER_EMAIL],
      );
      try {
        const res = await post(id, adminCookie);

        expect(res.status).toBe(200);
        expect(res.data).toEqual(
          expect.objectContaining({
            id,
            status: 'anonymized',
            firstName: null,
          }),
        );
        const records = await get(
          `/admin/consents?email=${REQUESTER_EMAIL}`,
          adminCookie,
        );
        expect(records.data.consents).toEqual([
          expect.objectContaining({
            withdrawal: expect.objectContaining({
              reason: 'account-deleted',
              enteredBy: ADMIN_EMAIL,
            }),
          }),
        ]);
        // Closed now, so a second request has nothing left to delete.
        expect((await post(id, adminCookie)).data.code).toBe('account-closed');
      } finally {
        await client.query('DELETE FROM users WHERE id = $1', [id]);
      }
    });
  });
});
