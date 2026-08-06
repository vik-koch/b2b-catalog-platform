import { hash } from '@node-rs/argon2';
import axios from 'axios';
import { Client } from 'pg';
import { requireEnv } from '../support/env';
import { deleteMatching, messagesMatching } from '../support/mailpit';

const SUFFIX = Math.random().toString(36).slice(2, 10);
const ADMIN_EMAIL = `e2e-users-admin-${SUFFIX}@example.com`;
const MANAGER_EMAIL = `e2e-users-manager-${SUFFIX}@example.com`;
const CUSTOMER_EMAIL = `e2e-users-customer-${SUFFIX}@example.com`;
const PENDING_EMAIL = `e2e-users-pending-${SUFFIX}@example.com`;
const CREATED_EMAIL = `e2e-users-created-${SUFFIX}@example.com`;
const PASSWORD = 'e2e-users-password';

const seeded = [
  ADMIN_EMAIL,
  MANAGER_EMAIL,
  CUSTOMER_EMAIL,
  PENDING_EMAIL,
  CREATED_EMAIL,
];

/**
 * The unchanged half of an edit. `updateUser` carries the whole editable set,
 * so a test about one field still has to send the rest — spreading this keeps
 * each case about the field it is actually testing.
 */
const edits = () => ({
  firstName: 'Jane',
  lastName: 'Doe',
  phone: '+49 40 1234567',
  customerType: 'person' as const,
  companyRegistrationId: null,
});

const request = (
  method: 'get' | 'post' | 'patch' | 'delete',
  url: string,
  cookie?: string,
  body?: unknown,
) =>
  axios.request({
    method,
    url,
    data: body,
    headers: cookie ? { Cookie: cookie } : {},
    validateStatus: () => true,
  });

/**
 * FR-AUTH-03/04 end to end, with NFR-SEC-04 as the thread running through it:
 * admin **and** manager decide who is a customer and what they pay; **only**
 * admin decides who is staff.
 */
describe('/admin/users', () => {
  let client: Client;
  let adminCookie: string;
  let managerCookie: string;
  let customerCookie: string;
  let tierId: string;
  let pendingId: string;

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
    status: string,
  ): Promise<string> => {
    const passwordHash = await hash(PASSWORD);
    const { rows } = await client.query(
      `INSERT INTO users (email, "passwordHash", role, status, "firstName", "lastName", phone, "customerType")
       VALUES ($1, $2, $3, $4, 'Jane', 'Doe', '+49 40 1234567', 'person')
       RETURNING id`,
      [email, passwordHash, role, status],
    );
    return rows[0].id;
  };

  const statusOf = async (email: string) => {
    const { rows } = await client.query(
      'SELECT id, status, role, "tierId", "approvedAt", "approvedBy" FROM users WHERE email = $1',
      [email],
    );
    return rows[0];
  };

  beforeAll(async () => {
    client = new Client({ connectionString: requireEnv('DATABASE_URL') });
    await client.connect();
    await client.query('DELETE FROM users WHERE email = ANY($1)', [seeded]);

    await seedUser(ADMIN_EMAIL, 'admin', 'active');
    await seedUser(MANAGER_EMAIL, 'manager', 'active');
    await seedUser(CUSTOMER_EMAIL, 'user', 'active');
    pendingId = await seedUser(PENDING_EMAIL, 'user', 'pending');

    adminCookie = await signIn(ADMIN_EMAIL);
    managerCookie = await signIn(MANAGER_EMAIL);
    customerCookie = await signIn(CUSTOMER_EMAIL);

    const tier = await request('post', '/admin/tiers', adminCookie, {
      key: `users-${SUFFIX}`,
      label: `Users ${SUFFIX}`,
    });
    tierId = tier.data.id;
  });

  afterAll(async () => {
    await client.query('UPDATE users SET "tierId" = NULL WHERE "tierId" = $1', [
      tierId,
    ]);
    await client.query('DELETE FROM customer_tiers WHERE id = $1', [tierId]);
    await client.query('DELETE FROM users WHERE email = ANY($1)', [seeded]);
    await client.end();
  });

  describe('guards (NFR-SEC-04)', () => {
    it('rejects an anonymous caller', async () => {
      expect((await request('get', '/admin/users')).status).toBe(401);
    });

    it('rejects a customer on every action', async () => {
      const responses = await Promise.all([
        request('get', '/admin/users', customerCookie),
        request('get', `/admin/users/${pendingId}`, customerCookie),
        request('post', `/admin/users/${pendingId}/approve`, customerCookie, {
          tierId: null,
        }),
        request('patch', `/admin/users/${pendingId}`, customerCookie, {
          ...edits(),
          tierId: null,
        }),
        request('delete', `/admin/users/${pendingId}`, customerCookie),
      ]);

      expect(responses.map((r) => r.status)).toEqual([403, 403, 403, 403, 403]);
    });

    // The split this whole surface exists to enforce.
    it('lets a manager re-tier a customer but not grant a role', async () => {
      const tier = await request(
        'patch',
        `/admin/users/${pendingId}`,
        managerCookie,
        { ...edits(), tierId },
      );
      const role = await request(
        'patch',
        `/admin/users/${pendingId}`,
        managerCookie,
        { ...edits(), tierId, role: 'admin' },
      );

      expect(tier.status).toBe(200);
      // The whole request is refused, not quietly stripped of the one field —
      // a refusal that looked like a save is the dangerous outcome here.
      expect(role.status).toBe(403);
      expect((await statusOf(PENDING_EMAIL)).role).toBe('user');

      await request('patch', `/admin/users/${pendingId}`, managerCookie, {
        ...edits(),
        tierId: null,
      });
    });

    // The other half of that boundary: staff are not merely hidden from a
    // manager's list, they are unreachable by id.
    it('hides a staff account from a manager even by direct id', async () => {
      const { id } = await statusOf(ADMIN_EMAIL);

      const read = await request('get', `/admin/users/${id}`, managerCookie);
      const write = await request(
        'patch',
        `/admin/users/${id}`,
        managerCookie,
        {
          ...edits(),
          tierId: null,
        },
      );

      expect(read.status).toBe(404);
      expect(write.status).toBe(404);
    });

    it('will not let a manager create a staff account', async () => {
      const res = await request('post', '/admin/users', managerCookie, {
        email: `e2e-users-blocked-${SUFFIX}@example.com`,
        role: 'manager',
        tierId: null,
        firstName: 'Nope',
        lastName: 'Nope',
      });

      expect(res.status).toBe(403);
    });

    // A manager must not be able to enumerate staff — not even by asking for it
    // directly, past the UI that would never offer the option.
    it('scopes a manager to customers, whatever kind is requested', async () => {
      const res = await request(
        'get',
        '/admin/users?kind=staff',
        managerCookie,
      );

      expect(res.status).toBe(200);
      const roles = res.data.users.map((u: { role: string }) => u.role);
      expect(roles).not.toContain('admin');
      expect(roles).not.toContain('manager');
    });

    it('lets an admin list staff, and only staff', async () => {
      const res = await request('get', '/admin/users?kind=staff', adminCookie);

      expect(res.status).toBe(200);
      const roles = res.data.users.map((u: { role: string }) => u.role);
      expect(roles).toContain('admin');
      expect(roles).not.toContain('user');
    });
  });

  describe('approval', () => {
    const invitationTo = (email: string) => `to:"${email}" subject:"ready"`;

    beforeEach(async () => {
      await deleteMatching(invitationTo(PENDING_EMAIL));
    });

    it('assigns the tier, records the approver, and invites — without a password', async () => {
      const res = await request(
        'post',
        `/admin/users/${pendingId}/approve`,
        managerCookie,
        { tierId },
      );

      expect(res.status).toBe(200);
      const row = await statusOf(PENDING_EMAIL);
      // `invited`, not `active`: nothing can sign in until the link is used.
      expect(row.status).toBe('invited');
      expect(row.tierId).toBe(tierId);
      expect(row.approvedAt).not.toBeNull();
      expect(row.approvedBy).not.toBeNull();

      const [mail] = await messagesMatching(invitationTo(PENDING_EMAIL));
      expect(mail).toBeDefined();

      const { rows: tokens } = await client.query(
        'SELECT "usedAt", "expiresAt" FROM password_tokens WHERE "userId" = $1',
        [pendingId],
      );
      expect(tokens).toHaveLength(1);
      expect(tokens[0].usedAt).toBeNull();
    });

    it('leaves an invited account unable to sign in', async () => {
      const res = await axios.post(
        '/auth/login',
        { email: PENDING_EMAIL, password: PASSWORD },
        { validateStatus: () => true },
      );

      expect(res.status).toBe(401);
    });

    it('refuses to approve anything that is not pending', async () => {
      const res = await request(
        'post',
        `/admin/users/${pendingId}/approve`,
        adminCookie,
        { tierId: null },
      );

      expect(res.status).toBe(409);
      // The first approval's tier is untouched by the refused second one.
      expect((await statusOf(PENDING_EMAIL)).tierId).toBe(tierId);
    });
  });

  describe('creating an account', () => {
    it('creates it invited, with a link and no password', async () => {
      const res = await request('post', '/admin/users', managerCookie, {
        email: CREATED_EMAIL,
        role: 'user',
        tierId,
        firstName: 'Sam',
        lastName: 'Smith',
      });

      expect(res.status).toBe(201);
      expect(res.data.status).toBe('invited');

      const [mail] = await messagesMatching(
        `to:"${CREATED_EMAIL}" subject:"created"`,
      );
      expect(mail).toBeDefined();

      const login = await axios.post(
        '/auth/login',
        { email: CREATED_EMAIL, password: PASSWORD },
        { validateStatus: () => true },
      );
      expect(login.status).toBe(401);
    });

    it('refuses an address that already has an account', async () => {
      const res = await request('post', '/admin/users', adminCookie, {
        email: CUSTOMER_EMAIL,
        role: 'user',
        tierId: null,
        firstName: 'Jane',
        lastName: 'Doe',
      });

      expect(res.status).toBe(409);
    });
  });

  describe('editing an account', () => {
    it('saves the details staff correct, and never the address', async () => {
      const { id, status } = await statusOf(PENDING_EMAIL);

      const res = await request('patch', `/admin/users/${id}`, adminCookie, {
        firstName: 'Janine',
        lastName: 'Doe-Smith',
        phone: '+49 40 7654321',
        customerType: 'company',
        companyRegistrationId: 'DE123456789',
        tierId,
      });

      expect(res.status).toBe(200);
      expect(res.data).toMatchObject({
        firstName: 'Janine',
        companyRegistrationId: 'DE123456789',
        tierId,
        // The login stays what it was: it is not a field on this request.
        email: PENDING_EMAIL,
      });
      // …and editing is not a lifecycle change: the account stands where it did.
      expect((await statusOf(PENDING_EMAIL)).status).toBe(status);
    });

    it('refuses a registration number without a company, and the reverse', async () => {
      const { id } = await statusOf(PENDING_EMAIL);

      const orphan = await request('patch', `/admin/users/${id}`, adminCookie, {
        ...edits(),
        customerType: 'person',
        companyRegistrationId: 'DE123456789',
        tierId: null,
      });
      const missing = await request(
        'patch',
        `/admin/users/${id}`,
        adminCookie,
        {
          ...edits(),
          customerType: 'company',
          companyRegistrationId: null,
          tierId: null,
        },
      );

      expect(orphan.status).toBe(400);
      expect(missing.status).toBe(400);
    });

    it('promotes and demotes for an admin, and drops the tier on the way out', async () => {
      const { id } = await statusOf(CUSTOMER_EMAIL);

      const promoted = await request(
        'patch',
        `/admin/users/${id}`,
        adminCookie,
        {
          ...edits(),
          tierId,
          role: 'manager',
        },
      );

      expect(promoted.status).toBe(200);
      // A price group on somebody who never sees prices is a contradiction.
      expect(promoted.data).toMatchObject({ role: 'manager', tierId: null });

      await request('patch', `/admin/users/${id}`, adminCookie, {
        ...edits(),
        tierId: null,
        role: 'user',
      });
      expect((await statusOf(CUSTOMER_EMAIL)).role).toBe('user');
    });

    // Locking yourself out of your own admin panel is the one mistake this
    // surface must not let you make.
    it('refuses to take the admin role from your own account', async () => {
      const { id } = await statusOf(ADMIN_EMAIL);

      const res = await request('patch', `/admin/users/${id}`, adminCookie, {
        ...edits(),
        customerType: null,
        tierId: null,
        role: 'manager',
      });

      expect(res.status).toBe(409);
      expect((await statusOf(ADMIN_EMAIL)).role).toBe('admin');
    });

    it('serves one account to the editor by id', async () => {
      const res = await request(
        'get',
        `/admin/users/${pendingId}`,
        managerCookie,
      );

      expect(res.status).toBe(200);
      expect(res.data.email).toBe(PENDING_EMAIL);
      expect(res.data).not.toHaveProperty('passwordHash');
    });
  });

  describe('the account list', () => {
    it('filters by status, role and tier', async () => {
      const byStatus = await request(
        'get',
        '/admin/users?status=invited',
        adminCookie,
      );
      const byRole = await request(
        'get',
        '/admin/users?role=admin',
        adminCookie,
      );
      const byTier = await request(
        'get',
        `/admin/users?tierId=${tierId}`,
        adminCookie,
      );

      expect(
        byStatus.data.users.every(
          (u: { status: string }) => u.status === 'invited',
        ),
      ).toBe(true);
      expect(
        byRole.data.users.every((u: { role: string }) => u.role === 'admin'),
      ).toBe(true);
      expect(
        byTier.data.users.every((u: { tierId: string }) => u.tierId === tierId),
      ).toBe(true);
    });

    it('searches across address, name and registration number', async () => {
      const res = await request(
        'get',
        `/admin/users?q=${encodeURIComponent(PENDING_EMAIL)}`,
        adminCookie,
      );

      expect(res.data.users).toHaveLength(1);
      expect(res.data.users[0].email).toBe(PENDING_EMAIL);
    });

    it('never exposes a password hash', async () => {
      const res = await request('get', '/admin/users', adminCookie);

      expect(JSON.stringify(res.data)).not.toContain('argon2');
    });
  });

  // 4b end to end: the link in the mail is the credential, and redeeming it is
  // what turns an approved account into one that can sign in.
  describe('redeeming the invitation', () => {
    const passwordOf = (email: string) =>
      client.query(
        'SELECT "passwordHash", status FROM users WHERE email = $1',
        [email],
      );

    /** The token as it left the app, read out of the delivered mail. */
    const tokenFor = async (email: string): Promise<string> => {
      const [mail] = await messagesMatching(`to:"${email}"`);
      const body = await axios.get(
        `http://localhost:8025/api/v1/message/${mail.ID}`,
      );
      const match = /set-password\?token=([A-Za-z0-9_-]+)/.exec(
        body.data.Text as string,
      );
      if (!match) throw new Error('no set-password link in the invitation');
      return match[1];
    };

    it('reports what the link is for before anything is typed', async () => {
      const token = await tokenFor(CREATED_EMAIL);

      const res = await axios.get(`/auth/password-token/${token}`, {
        validateStatus: () => true,
      });

      expect(res.status).toBe(200);
      // Never had a password, so this is "choose one", not "reset".
      expect(res.data).toEqual({ purpose: 'set', email: CREATED_EMAIL });
    });

    it('refuses a password the policy rejects, without spending the link', async () => {
      const token = await tokenFor(CREATED_EMAIL);

      const res = await axios.post(
        '/auth/set-password',
        { token, password: 'password1234' },
        { validateStatus: () => true },
      );

      expect(res.status).toBe(400);
      // Still usable: a refused password must not cost the visitor their link.
      expect(
        (
          await axios.get(`/auth/password-token/${token}`, {
            validateStatus: () => true,
          })
        ).status,
      ).toBe(200);
    });

    it('sets the password, activates the account and signs it in — once', async () => {
      const token = await tokenFor(CREATED_EMAIL);
      const password = 'a stubbornly long passphrase';

      const res = await axios.post(
        '/auth/set-password',
        { token, password },
        { validateStatus: () => true },
      );

      expect(res.status).toBe(200);
      expect(res.data.email).toBe(CREATED_EMAIL);
      expect(res.headers['set-cookie']).toBeDefined();
      expect((await passwordOf(CREATED_EMAIL)).rows[0].status).toBe('active');

      // The password now works where it did not before.
      const login = await axios.post(
        '/auth/login',
        { email: CREATED_EMAIL, password },
        { validateStatus: () => true },
      );
      expect(login.status).toBe(200);

      // And the link is spent: single-use is the whole security model.
      const reuse = await axios.post(
        '/auth/set-password',
        { token, password: 'another perfectly long one' },
        { validateStatus: () => true },
      );
      expect(reuse.status).toBe(404);
    });

    it('answers an unknown link exactly as it answers a used one', async () => {
      const res = await axios.get('/auth/password-token/not-a-real-token', {
        validateStatus: () => true,
      });

      expect(res.status).toBe(404);
    });
  });

  describe('declining a registration', () => {
    it('purges a pending row outright, and refuses anything else', async () => {
      const declineId = await seedUser(
        `e2e-users-decline-${SUFFIX}@example.com`,
        'user',
        'pending',
      );

      expect(
        (await request('delete', `/admin/users/${declineId}`, managerCookie))
          .status,
      ).toBe(200);
      const { rows } = await client.query(
        'SELECT id FROM users WHERE id = $1',
        [declineId],
      );
      expect(rows).toHaveLength(0);

      // An account that has been usable is anonymized (FR-AUTH-06), not deleted.
      const { id } = await statusOf(CUSTOMER_EMAIL);
      expect(
        (await request('delete', `/admin/users/${id}`, adminCookie)).status,
      ).toBe(409);
    });
  });
});
