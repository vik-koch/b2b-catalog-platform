import { hash } from '@node-rs/argon2';
import axios from 'axios';
import { Client } from 'pg';
import { ADDRESS_BOOK_MAX } from '@b2b-catalog-platform/shared';
import { requireEnv } from '../support/env';

/**
 * The account's address book (FR-CART-04) and the suggestion proxy
 * (FR-CART-11), end to end against the real API and database.
 *
 * The question this suite exists for is scoping: every route reads the account
 * from the session, so one customer must never reach another's row — not with
 * a guessed id, and not with one they were handed.
 */

const SUFFIX = Math.random().toString(36).slice(2, 10);
const OWNER_EMAIL = `e2e-addresses-owner-${SUFFIX}@example.com`;
const OTHER_EMAIL = `e2e-addresses-other-${SUFFIX}@example.com`;
const PASSWORD = 'e2e-addresses-password';

const ADDRESS_KEYS = [
  'city',
  'companyId',
  'companyName',
  'country',
  'createdAt',
  'id',
  'label',
  'phone',
  'postalCode',
  'region',
  'street',
  'street2',
  'updatedAt',
];

/** The whole editable set: create and update both carry all of it. */
const address = (overrides: Record<string, unknown> = {}) => ({
  label: 'Shop',
  companyName: 'Kontor GmbH',
  companyId: 'DE123456789',
  street: 'Hafenstraße 12',
  street2: null,
  postalCode: '20359',
  city: 'Hamburg',
  region: null,
  country: 'DE',
  phone: '+49 40 1234567',
  ...overrides,
});

describe('/account/addresses (FR-CART-04)', () => {
  let client: Client;
  let ownerCookie: string;
  let otherCookie: string;
  let ownerId: string;

  const signIn = async (email: string) => {
    const res = await axios.post('/auth/login', { email, password: PASSWORD });
    const cookie = (res.headers['set-cookie'] as string[] | undefined)
      ?.find((c) => c.startsWith('session='))
      ?.split(';')[0];
    if (!cookie) throw new Error(`could not sign in as ${email}`);
    return cookie;
  };

  const get = (url: string, cookie?: string) =>
    axios.get(url, {
      headers: cookie ? { Cookie: cookie } : {},
      validateStatus: () => true,
    });
  const post = (url: string, body: unknown, cookie?: string) =>
    axios.post(url, body, {
      headers: cookie ? { Cookie: cookie } : {},
      validateStatus: () => true,
    });
  const put = (url: string, body: unknown, cookie?: string) =>
    axios.put(url, body, {
      headers: cookie ? { Cookie: cookie } : {},
      validateStatus: () => true,
    });
  const del = (url: string, cookie?: string) =>
    axios.delete(url, {
      headers: cookie ? { Cookie: cookie } : {},
      validateStatus: () => true,
    });

  beforeAll(async () => {
    client = new Client({ connectionString: requireEnv('DATABASE_URL') });
    await client.connect();
    await client.query('DELETE FROM users WHERE email = ANY($1)', [
      [OWNER_EMAIL, OTHER_EMAIL],
    ]);

    const passwordHash = await hash(PASSWORD);
    const { rows } = await client.query(
      `INSERT INTO users (email, "passwordHash", role, status, "firstName", "lastName")
       VALUES ($1, $2, 'user', 'active', 'Ada', 'Owner') RETURNING id`,
      [OWNER_EMAIL, passwordHash],
    );
    ownerId = rows[0].id;
    await client.query(
      `INSERT INTO users (email, "passwordHash", role, status)
       VALUES ($1, $2, 'user', 'active')`,
      [OTHER_EMAIL, passwordHash],
    );

    ownerCookie = await signIn(OWNER_EMAIL);
    otherCookie = await signIn(OTHER_EMAIL);
  });

  afterEach(async () => {
    await client.query(
      'DELETE FROM addresses WHERE "userId" IN (SELECT id FROM users WHERE email = ANY($1))',
      [[OWNER_EMAIL, OTHER_EMAIL]],
    );
  });

  afterAll(async () => {
    // The addresses cascade with the accounts.
    await client.query('DELETE FROM users WHERE email = ANY($1)', [
      [OWNER_EMAIL, OTHER_EMAIL],
    ]);
    await client.end();
  });

  describe('authorization', () => {
    it('rejects an anonymous list with 401', async () => {
      expect((await get('/account/addresses')).status).toBe(401);
    });

    it('rejects an anonymous create with 401', async () => {
      expect((await post('/account/addresses', address())).status).toBe(401);
    });
  });

  it('creates an address in exactly the contract shape', async () => {
    const res = await post('/account/addresses', address(), ownerCookie);

    expect(res.status).toBe(201);
    expect(Object.keys(res.data).sort()).toEqual(ADDRESS_KEYS);
    expect(res.data).toMatchObject({
      label: 'Shop',
      street: 'Hafenstraße 12',
      postalCode: '20359',
      country: 'DE',
    });
    // The owner is the session's, never the body's.
    expect(res.data).not.toHaveProperty('userId');
  });

  it('lists only the signed-in account’s own addresses', async () => {
    await post('/account/addresses', address({ label: 'Mine' }), ownerCookie);
    await post('/account/addresses', address({ label: 'Theirs' }), otherCookie);

    const mine = await get('/account/addresses', ownerCookie);
    expect(mine.data.items).toHaveLength(1);
    expect(mine.data.items[0].label).toBe('Mine');
  });

  it('refuses a body carrying anything but the address fields', async () => {
    const res = await post(
      '/account/addresses',
      { ...address(), userId: ownerId },
      ownerCookie,
    );

    expect(res.status).toBe(400);
  });

  it('updates an address and answers with the stored row', async () => {
    const created = await post('/account/addresses', address(), ownerCookie);
    const res = await put(
      `/account/addresses/${created.data.id}`,
      address({ label: 'Warehouse', street2: 'Gate 4' }),
      ownerCookie,
    );

    expect(res.status).toBe(200);
    expect(res.data).toMatchObject({ label: 'Warehouse', street2: 'Gate 4' });

    const read = await get('/account/addresses', ownerCookie);
    expect(read.data.items[0]).toMatchObject({ label: 'Warehouse' });
  });

  it('deletes an address', async () => {
    const created = await post('/account/addresses', address(), ownerCookie);

    expect(
      (await del(`/account/addresses/${created.data.id}`, ownerCookie)).status,
    ).toBe(200);
    expect((await get('/account/addresses', ownerCookie)).data.items).toEqual(
      [],
    );
  });

  describe('another account’s row', () => {
    it('is a 404 to read through an update, not a 403', async () => {
      const theirs = await post('/account/addresses', address(), otherCookie);
      const res = await put(
        `/account/addresses/${theirs.data.id}`,
        address({ label: 'Hijacked' }),
        ownerCookie,
      );

      expect(res.status).toBe(404);
      // And it is untouched.
      const read = await get('/account/addresses', otherCookie);
      expect(read.data.items[0].label).toBe('Shop');
    });

    it('is a 404 to delete', async () => {
      const theirs = await post('/account/addresses', address(), otherCookie);
      const res = await del(
        `/account/addresses/${theirs.data.id}`,
        ownerCookie,
      );

      expect(res.status).toBe(404);
      expect(
        (await get('/account/addresses', otherCookie)).data.items,
      ).toHaveLength(1);
    });
  });

  it('refuses a country the deployment does not ship to', async () => {
    const res = await post(
      '/account/addresses',
      address({ country: 'JP' }),
      ownerCookie,
    );

    expect(res.status).toBe(409);
    expect(res.data.code).toBe('unsupported-country');
  });

  // The same rule registration is checked against — a picker and a mask are
  // entry aids, and the API applies the patterns itself.
  it('refuses a registration number matching no configured format', async () => {
    const res = await post(
      '/account/addresses',
      address({ companyId: 'DE12' }),
      ownerCookie,
    );

    expect(res.status).toBe(400);
    expect(res.data.code).toBe('invalid-company-id');
  });

  it('takes an address with no registration number at all', async () => {
    const res = await post(
      '/account/addresses',
      address({ companyId: null, companyName: null }),
      ownerCookie,
    );

    // A delivery address invoiced to nobody is an ordinary address; only a
    // submitted order can say whether a company was needed.
    expect(res.status).toBe(201);
    expect(res.data.companyId).toBeNull();
  });

  it('takes an address with no label', async () => {
    const res = await post(
      '/account/addresses',
      address({ label: null }),
      ownerCookie,
    );

    // Naming an address is how a customer tells two of them apart, not a step
    // between them and their first one.
    expect(res.status).toBe(201);
    expect(res.data.label).toBeNull();
  });

  it('refuses a country code that is not one', async () => {
    const res = await post(
      '/account/addresses',
      address({ country: 'Germany' }),
      ownerCookie,
    );

    expect(res.status).toBe(400);
  });

  it('caps the book and says why', async () => {
    // Straight into the table: the point is the ceiling, not the endpoint's
    // throughput, and fifty round trips would be fifty seconds of nothing.
    await client.query(
      `INSERT INTO addresses ("userId", label, street, "postalCode", city, country)
       SELECT $1, 'Bulk ' || i, 'Street 1', '20359', 'Hamburg', 'DE'
       FROM generate_series(1, $2) AS i`,
      [ownerId, ADDRESS_BOOK_MAX],
    );

    const res = await post('/account/addresses', address(), ownerCookie);

    expect(res.status).toBe(409);
    expect(res.data.code).toBe('address-limit-reached');
  });
});

/**
 * The suggestion proxy. The open deployment configures no adapter, so the
 * assertion is that it answers rather than fails — the field degrading to plain
 * typing is the documented default, not an outage.
 */
describe('/addresses/suggestions (FR-CART-11)', () => {
  it('answers a guest with an empty list when no provider is configured', async () => {
    const res = await axios.get('/addresses/suggestions?q=Hafenstra', {
      validateStatus: () => true,
    });

    expect(res.status).toBe(200);
    expect(res.data.items).toEqual([]);
  });

  it('refuses a query longer than the cap (NFR-SEC-08)', async () => {
    const res = await axios.get(`/addresses/suggestions?q=${'a'.repeat(200)}`, {
      validateStatus: () => true,
    });

    expect(res.status).toBe(400);
  });
});
