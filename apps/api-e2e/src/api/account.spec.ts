import { hash } from '@node-rs/argon2';
import axios from 'axios';
import { Client } from 'pg';
import { requireEnv } from '../support/env';
import { deleteMatching, messagesMatching } from '../support/mailpit';

const SUFFIX = Math.random().toString(36).slice(2, 10);
const CUSTOMER_EMAIL = `e2e-account-customer-${SUFFIX}@example.com`;
const STAFF_EMAIL = `e2e-account-staff-${SUFFIX}@example.com`;
const PASSWORD = 'e2e-account-password';

const seeded = [CUSTOMER_EMAIL, STAFF_EMAIL];

const request = (url: string, cookie?: string) =>
  axios.get(url, {
    headers: cookie ? { Cookie: cookie } : {},
    validateStatus: () => true,
  });

const patch = (url: string, cookie: string | undefined, body: unknown) =>
  axios.patch(url, body, {
    headers: cookie ? { Cookie: cookie } : {},
    validateStatus: () => true,
  });

/** The whole editable set — `updateProfile` carries all of it, so a test about
 * one field still has to send the rest. */
const edits = () => ({
  firstName: 'Jane',
  lastName: 'Doe',
  phone: '+49 40 7654321',
});

/**
 * The account holder's own record. The point of the endpoint is what it does
 * *not* say: a customer must not learn their pricing tier from it (ADR 0031),
 * whatever the staff view of the same row carries.
 */
describe('/account/profile', () => {
  let client: Client;
  let customerCookie: string;
  let staffCookie: string;
  let tierId: string;

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

  beforeAll(async () => {
    client = new Client({ connectionString: requireEnv('DATABASE_URL') });
    await client.connect();
    await client.query('DELETE FROM users WHERE email = ANY($1)', [seeded]);

    const { rows } = await client.query(
      `INSERT INTO customer_tiers (key, label) VALUES ($1, $2) RETURNING id`,
      [`account-${SUFFIX}`, `Account ${SUFFIX}`],
    );
    tierId = rows[0].id;

    const passwordHash = await hash(PASSWORD);
    // A registered customer: every identifying field filled, and on a tier.
    await client.query(
      `INSERT INTO users (email, "passwordHash", role, status, "firstName", "lastName", phone, "customerType", "companyName", "companyRegistrationId", "tierId")
       VALUES ($1, $2, 'user', 'active', 'Jane', 'Doe', '+49 40 1234567', 'company', 'Kontor GmbH', '12345678', $3)`,
      [CUSTOMER_EMAIL, passwordHash, tierId],
    );
    // Staff describe nobody: the nullable half of the same shape.
    await client.query(
      `INSERT INTO users (email, "passwordHash", role, status)
       VALUES ($1, $2, 'manager', 'active')`,
      [STAFF_EMAIL, passwordHash],
    );

    customerCookie = await signIn(CUSTOMER_EMAIL);
    staffCookie = await signIn(STAFF_EMAIL);
  });

  afterAll(async () => {
    await client.query('DELETE FROM users WHERE email = ANY($1)', [seeded]);
    await client.query('DELETE FROM customer_tiers WHERE id = $1', [tierId]);
    await client.end();
  });

  it('rejects an anonymous caller', async () => {
    expect((await request('/account/profile')).status).toBe(401);
  });

  it('returns the signed-in customer their own record', async () => {
    const res = await request('/account/profile', customerCookie);

    expect(res.status).toBe(200);
    expect(res.data).toMatchObject({
      email: CUSTOMER_EMAIL,
      role: 'user',
      firstName: 'Jane',
      lastName: 'Doe',
      phone: '+49 40 1234567',
      customerType: 'company',
      companyName: 'Kontor GmbH',
      companyRegistrationId: '12345678',
    });
    expect(typeof res.data.createdAt).toBe('string');
  });

  // The invariant this endpoint exists to keep: the row has a tier, the answer
  // does not mention it under any name.
  it('never reveals the pricing tier', async () => {
    const res = await request('/account/profile', customerCookie);

    expect(Object.keys(res.data)).not.toContain('tierId');
    expect(JSON.stringify(res.data)).not.toContain(tierId);
  });

  it('serves staff the same shape, with the fields they lack null', async () => {
    const res = await request('/account/profile', staffCookie);

    expect(res.status).toBe(200);
    expect(res.data).toMatchObject({
      email: STAFF_EMAIL,
      role: 'manager',
      firstName: null,
      lastName: null,
      phone: null,
      customerType: null,
      companyName: null,
      companyRegistrationId: null,
    });
  });

  describe('correcting your own details', () => {
    // Restored after each case, so the order of the tests cannot matter.
    afterEach(async () => {
      await client.query(
        `UPDATE users SET "firstName" = 'Jane', "lastName" = 'Doe', phone = '+49 40 1234567',
                          role = 'user', "tierId" = $2, status = 'active'
         WHERE email = $1`,
        [CUSTOMER_EMAIL, tierId],
      );
    });

    it('rejects an anonymous caller', async () => {
      expect((await patch('/account/profile', undefined, edits())).status).toBe(
        401,
      );
    });

    it('saves the name and phone number, and answers with the record', async () => {
      const res = await patch('/account/profile', customerCookie, edits());

      expect(res.status).toBe(200);
      expect(res.data).toMatchObject(edits());

      const { rows } = await client.query(
        'SELECT "firstName", "lastName", phone FROM users WHERE email = $1',
        [CUSTOMER_EMAIL],
      );
      expect(rows[0]).toEqual({
        firstName: 'Jane',
        lastName: 'Doe',
        phone: '+49 40 7654321',
      });
    });

    it('clears the phone number when it is null', async () => {
      const res = await patch('/account/profile', customerCookie, {
        ...edits(),
        phone: null,
      });

      expect(res.status).toBe(200);
      expect(res.data.phone).toBeNull();
    });

    // The whole point of `.strict()`: a self-service write is not a way to
    // grant yourself a role, a tier, or a status.
    it('refuses a body carrying anything but the editable fields', async () => {
      const responses = await Promise.all([
        patch('/account/profile', customerCookie, {
          ...edits(),
          role: 'admin',
        }),
        patch('/account/profile', customerCookie, {
          ...edits(),
          tierId: null,
        }),
        patch('/account/profile', customerCookie, {
          ...edits(),
          status: 'active',
        }),
        patch('/account/profile', customerCookie, {
          ...edits(),
          email: 'someone-else@example.com',
        }),
      ]);

      expect(responses.map((r) => r.status)).toEqual([400, 400, 400, 400]);

      const { rows } = await client.query(
        'SELECT role, "tierId" FROM users WHERE email = $1',
        [CUSTOMER_EMAIL],
      );
      expect(rows[0]).toEqual({ role: 'user', tierId });
    });

    it('refuses an empty name', async () => {
      const res = await patch('/account/profile', customerCookie, {
        ...edits(),
        firstName: '   ',
      });

      expect(res.status).toBe(400);
    });

    // A session outliving the account's right to use it. The guard refuses it
    // first; the write is scoped to `active` rows as well, so the answer does
    // not depend on which of the two notices.
    it('refuses to write once the account is no longer active', async () => {
      await client.query(
        `UPDATE users SET status = 'disabled' WHERE email = $1`,
        [CUSTOMER_EMAIL],
      );

      const res = await patch('/account/profile', customerCookie, edits());

      expect(res.status).toBe(401);
    });
  });

  describe('deleting your own account (FR-AUTH-06)', () => {
    const DELETE_EMAIL = `e2e-account-leaver-${SUFFIX}@example.com`;
    let leaverCookie: string;
    let leaverId: string;

    // Its own account per case: deletion is one-way, so a shared one would
    // only work for whichever test ran first.
    beforeEach(async () => {
      await client.query('DELETE FROM users WHERE email = $1', [DELETE_EMAIL]);
      const { rows } = await client.query(
        `INSERT INTO users (email, "passwordHash", role, status, "firstName", "lastName", phone, "customerType", "companyName", "companyRegistrationId", "tierId")
         VALUES ($1, $2, 'user', 'active', 'Jane', 'Doe', '+49 40 1234567', 'company', 'Kontor GmbH', '12345678', $3)
         RETURNING id`,
        [DELETE_EMAIL, await hash(PASSWORD), tierId],
      );
      leaverId = rows[0].id;
      leaverCookie = await signIn(DELETE_EMAIL);
      await deleteMatching(DELETE_EMAIL);
    });

    afterEach(async () => {
      await client.query('DELETE FROM users WHERE id = $1', [leaverId]);
    });

    const remove = (cookie: string | undefined, password: unknown) =>
      axios.post(
        '/account/delete',
        { password },
        {
          headers: cookie ? { Cookie: cookie } : {},
          validateStatus: () => true,
        },
      );

    it('rejects an anonymous caller', async () => {
      expect((await remove(undefined, PASSWORD)).status).toBe(401);
    });

    it('refuses a wrong password and leaves the account alone', async () => {
      const res = await remove(leaverCookie, 'not-the-password');

      expect(res.status).toBe(400);
      const { rows } = await client.query(
        'SELECT status, email FROM users WHERE id = $1',
        [leaverId],
      );
      expect(rows[0]).toEqual({ status: 'active', email: DELETE_EMAIL });
    });

    it('anonymizes the row, keeping it, and frees the address', async () => {
      const res = await remove(leaverCookie, PASSWORD);

      expect(res.status).toBe(200);
      const { rows } = await client.query(
        `SELECT status, email, "firstName", "lastName", phone, "customerType",
                "companyName", "companyRegistrationId", "tierId"
         FROM users WHERE id = $1`,
        [leaverId],
      );
      // The row survives — it is an FK target for the audit trail and for
      // orders, which are anonymized rather than deleted.
      expect(rows[0]).toEqual({
        status: 'anonymized',
        email: `deleted-${leaverId}@deleted.invalid`,
        firstName: null,
        lastName: null,
        phone: null,
        customerType: null,
        companyName: null,
        companyRegistrationId: null,
        tierId: null,
      });
    });

    it('frees the address for a genuinely new account', async () => {
      await remove(leaverCookie, PASSWORD);

      // Nothing links the two: the old row no longer carries the address, so
      // the unique index does not object and the new row is its own account.
      const { rows } = await client.query(
        `INSERT INTO users (email, "passwordHash", role, status)
         VALUES ($1, $2, 'user', 'pending') RETURNING id`,
        [DELETE_EMAIL, await hash(PASSWORD)],
      );
      expect(rows[0].id).not.toBe(leaverId);

      await client.query('DELETE FROM users WHERE id = $1', [rows[0].id]);
    });

    it('deletes the saved addresses with the account', async () => {
      await client.query(
        `INSERT INTO addresses ("userId", label, street, "postalCode", city, country)
         VALUES ($1, 'Shop', 'Hafenstraße 12', '20359', 'Hamburg', 'DE')`,
        [leaverId],
      );

      expect((await remove(leaverCookie, PASSWORD)).status).toBe(200);

      // The privacy copy promises the details go; orders keep their own
      // snapshot, so nothing readable is lost by emptying the book.
      const { rows } = await client.query(
        'SELECT count(*)::int AS count FROM addresses WHERE "userId" = $1',
        [leaverId],
      );
      expect(rows[0].count).toBe(0);
    });

    it('ends the session it was called with', async () => {
      await remove(leaverCookie, PASSWORD);

      // The cookie is cleared on the response, but the token is dead either
      // way: `tokenVersion` moved, so a copy of it is no use.
      expect((await request('/account/profile', leaverCookie)).status).toBe(
        401,
      );
    });

    it('refuses the login afterwards', async () => {
      await remove(leaverCookie, PASSWORD);

      const res = await axios.post(
        '/auth/login',
        { email: DELETE_EMAIL, password: PASSWORD },
        { validateStatus: () => true },
      );
      expect(res.status).toBe(401);
    });

    it('confirms it to the address that asked, before it is overwritten', async () => {
      await remove(leaverCookie, PASSWORD);

      const messages = await messagesMatching(DELETE_EMAIL);
      expect(messages).toHaveLength(1);
      expect(messages[0].Subject).toContain('deleted');
    });

    // The last-admin refusal is *not* tested here: making an account the last
    // admin means disabling every other one, and the suite is parallel — it
    // would pull the rug from under whatever else is signed in as an admin.
    // AccountDeletion's own spec covers the rule.

    // Staff leave like anyone else — the last-admin rule is the only limit.
    it('lets a manager delete their own account', async () => {
      await client.query(`UPDATE users SET role = 'manager' WHERE id = $1`, [
        leaverId,
      ]);

      expect((await remove(leaverCookie, PASSWORD)).status).toBe(200);
    });
  });
});
