import { hash } from '@node-rs/argon2';
import axios from 'axios';
import { Client } from 'pg';
import { ROUTE_ACCESS } from '@b2b-catalog-platform/shared/node';
import { requireEnv } from '../support/env';

/**
 * Every route in ROUTE_ACCESS, knocked on by everyone who must be turned away
 * (NFR-SEC-04). The API's route-access spec proves what each route declares;
 * this proves the running API refuses accordingly — a guest, a customer on
 * staff routes, a manager on admin-only ones, a cookie on machine routes, and a
 * machine token anywhere but its own scope.
 *
 * Guards run before validation and before the handler, so a placeholder fills
 * every path parameter and an empty body every write: nothing here reaches a
 * record, and a 404 means the table names a route the API does not serve.
 * Whose record a signed-in route returns is the handler's job, and each such
 * route's own spec proves another customer gets a 404.
 */

const SUFFIX = Math.random().toString(36).slice(2, 10);
const ADMIN_EMAIL = `e2e-sweep-admin-${SUFFIX}@example.com`;
const MANAGER_EMAIL = `e2e-sweep-manager-${SUFFIX}@example.com`;
const CUSTOMER_EMAIL = `e2e-sweep-customer-${SUFFIX}@example.com`;
const PASSWORD = 'e2e-sweep-password';
const TOKEN_SCOPE = 'order-read';

interface Route {
  key: string;
  method: string;
  url: string;
  access: string;
}

const routes: Route[] = Object.entries(ROUTE_ACCESS).map(([key, access]) => {
  const [method, path] = key.split(' ');
  return {
    key,
    method,
    // The table's paths carry the global prefix; axios's base URL already does.
    url: path.replace(/^\/api/, '').replace(/:[^/]+/g, 'e2e-sweep'),
    access,
  };
});

const isSession = (access: string) =>
  access !== 'public' && !access.startsWith('machine:');
const isMachine = (access: string) => access.startsWith('machine:');
const isStaff = (access: string) => isSession(access) && access !== 'signed-in';
const isAdminOnly = (access: string) => access === 'admin';

describe('route access, as the running API answers it', () => {
  let client: Client;
  let adminCookie: string;
  let managerCookie: string;
  let customerCookie: string;
  let tokenId: string;
  let token: string;

  const call = (route: Route, headers: Record<string, string> = {}) =>
    axios.request({
      method: route.method,
      url: route.url,
      data: ['POST', 'PUT', 'PATCH'].includes(route.method) ? {} : undefined,
      headers,
      validateStatus: () => true,
    });

  /** Each route whose answer is not `status`, as `KEY → actual`. */
  const answering = async (
    selected: Route[],
    status: number,
    headers: Record<string, string> = {},
  ) => {
    const wrong: string[] = [];
    for (const route of selected) {
      const res = await call(route, headers);
      if (res.status !== status) wrong.push(`${route.key} → ${res.status}`);
    }
    return wrong;
  };

  const seedUser = async (email: string, role: string) => {
    await client.query(
      `INSERT INTO users (email, "passwordHash", role, status, "firstName", "lastName", phone, "customerType", "passwordSetAt")
       VALUES ($1, $2, $3, 'active', 'Jane', 'Doe', '+49 40 1234567', 'person', now())`,
      [email, await hash(PASSWORD), role],
    );
  };

  const signIn = async (email: string) => {
    const res = await axios.post('/auth/login', { email, password: PASSWORD });
    const cookie = (res.headers['set-cookie'] as string[] | undefined)
      ?.find((c) => c.startsWith('session='))
      ?.split(';')[0];
    if (!cookie) throw new Error(`could not sign in as ${email}`);
    return cookie;
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

    const issued = await axios.post(
      '/admin/api-tokens',
      { name: `e2e sweep ${SUFFIX}`, scopes: [TOKEN_SCOPE] },
      { headers: { Cookie: adminCookie } },
    );
    tokenId = issued.data.id;
    token = issued.data.token;
  });

  afterAll(async () => {
    await axios.post(`/admin/api-tokens/${tokenId}/revoke`, undefined, {
      headers: { Cookie: adminCookie },
      validateStatus: () => true,
    });
    await client.query('DELETE FROM users WHERE email = ANY($1)', [
      [ADMIN_EMAIL, MANAGER_EMAIL, CUSTOMER_EMAIL],
    ]);
    await client.end();
  });

  it('asks a guest to sign in on every route that is not public', async () => {
    const guarded = routes.filter((r) => r.access !== 'public');
    expect(await answering(guarded, 401)).toEqual([]);
  });

  it('refuses a customer every staff route', async () => {
    expect(
      await answering(routes.filter((r) => isStaff(r.access)), 403, {
        Cookie: customerCookie,
      }),
    ).toEqual([]);
  });

  it('refuses a manager every admin-only route', async () => {
    expect(
      await answering(routes.filter((r) => isAdminOnly(r.access)), 403, {
        Cookie: managerCookie,
      }),
    ).toEqual([]);
  });

  it('takes no session for a machine credential', async () => {
    const machine = routes.filter((r) => isMachine(r.access));
    expect(await answering(machine, 401, { Cookie: adminCookie })).toEqual([]);
    expect(await answering(machine, 401, { Cookie: customerCookie })).toEqual(
      [],
    );
  });

  it('takes no machine token for a session', async () => {
    expect(
      await answering(routes.filter((r) => isSession(r.access)), 401, {
        Authorization: `Bearer ${token}`,
      }),
    ).toEqual([]);
  });

  it('holds a machine token to its own scope', async () => {
    const elsewhere = routes.filter(
      (r) => isMachine(r.access) && r.access !== `machine:${TOKEN_SCOPE}`,
    );
    expect(elsewhere.length).toBeGreaterThan(0);
    expect(
      await answering(elsewhere, 403, { Authorization: `Bearer ${token}` }),
    ).toEqual([]);
  });
});
