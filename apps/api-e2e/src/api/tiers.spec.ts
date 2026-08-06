import { hash } from '@node-rs/argon2';
import axios from 'axios';
import { Client } from 'pg';
import { requireEnv } from '../support/env';

/**
 * Tier administration (FR-AUTH-05, admin side; NFR-SEC-04 for the guards).
 *
 * Against the real database on purpose: the delete guard is ultimately the two
 * restricting foreign keys of ADR 0031, and the reserved `default` key is a
 * check constraint — neither is provable against a stubbed driver.
 */

const ADMIN_EMAIL = 'e2e-tiers-admin@example.com';
const MANAGER_EMAIL = 'e2e-tiers-manager@example.com';
const USER_EMAIL = 'e2e-tiers-user@example.com';
const PASSWORD = 'e2e-tiers-password';

// Per-run suffix, so leftovers from a crashed run cannot collide with this
// run's keys.
const R = Date.now().toString(36);
const keyFor = (name: string) => `e2e-${name}-${R}`;

async function loginAs(email: string): Promise<string> {
  const res = await axios.post('/auth/login', { email, password: PASSWORD });
  const cookie = (res.headers['set-cookie'] as string[] | undefined)
    ?.find((c) => c.startsWith('session='))
    ?.split(';')[0];
  if (!cookie) throw new Error(`login failed for ${email}`);
  return cookie;
}

describe('Customer tiers admin (FR-AUTH-05)', () => {
  let client: Client;
  let adminCookie = '';
  let managerCookie = '';
  let userCookie = '';
  const createdTierIds: string[] = [];

  const post = (url: string, body: unknown, cookie = adminCookie) =>
    axios.post(url, body, {
      headers: cookie ? { Cookie: cookie } : {},
      validateStatus: () => true,
    });
  const patch = (url: string, body: unknown, cookie = adminCookie) =>
    axios.patch(url, body, {
      headers: cookie ? { Cookie: cookie } : {},
      validateStatus: () => true,
    });
  const put = (url: string, body: unknown, cookie = adminCookie) =>
    axios.put(url, body, {
      headers: cookie ? { Cookie: cookie } : {},
      validateStatus: () => true,
    });
  const del = (url: string, cookie = adminCookie) =>
    axios.delete(url, {
      headers: cookie ? { Cookie: cookie } : {},
      validateStatus: () => true,
    });
  const get = (url: string, cookie = adminCookie) =>
    axios.get(url, {
      headers: cookie ? { Cookie: cookie } : {},
      validateStatus: () => true,
    });

  async function createTier(body: Record<string, unknown>) {
    const res = await post('/admin/tiers', body);
    if (res.status === 201) createdTierIds.push(res.data.id);
    return res;
  }

  beforeAll(async () => {
    client = new Client({ connectionString: requireEnv('DATABASE_URL') });
    await client.connect();

    const passwordHash = await hash(PASSWORD);
    for (const [email, role] of [
      [ADMIN_EMAIL, 'admin'],
      [MANAGER_EMAIL, 'manager'],
      [USER_EMAIL, 'user'],
    ] as const) {
      await client.query('DELETE FROM users WHERE email = $1', [email]);
      await client.query(
        `INSERT INTO users (email, "passwordHash", role, status)
         VALUES ($1, $2, $3, 'active')`,
        [email, passwordHash, role],
      );
    }

    adminCookie = await loginAs(ADMIN_EMAIL);
    managerCookie = await loginAs(MANAGER_EMAIL);
    userCookie = await loginAs(USER_EMAIL);
  });

  afterAll(async () => {
    // Detach anything the tests attached, then drop the tiers themselves.
    await client.query(
      'UPDATE users SET "tierId" = NULL WHERE "tierId" = ANY($1)',
      [createdTierIds],
    );
    await client.query('DELETE FROM product_prices WHERE "tierId" = ANY($1)', [
      createdTierIds,
    ]);
    await client.query('DELETE FROM customer_tiers WHERE id = ANY($1)', [
      createdTierIds,
    ]);
    await client.query('DELETE FROM users WHERE email = ANY($1)', [
      [ADMIN_EMAIL, MANAGER_EMAIL, USER_EMAIL],
    ]);
    await client.end();
  });

  describe('guards (NFR-SEC-04)', () => {
    it('rejects an anonymous caller with 401', async () => {
      expect((await get('/admin/tiers', '')).status).toBe(401);
    });

    it('rejects a manager with 403 — defining price lists is admin-only', async () => {
      expect((await get('/admin/tiers', managerCookie)).status).toBe(403);
      expect(
        (
          await post(
            '/admin/tiers',
            { key: keyFor('mgr'), label: 'Nope' },
            managerCookie,
          )
        ).status,
      ).toBe(403);
    });

    it('rejects a customer with 403', async () => {
      expect((await get('/admin/tiers', userCookie)).status).toBe(403);
    });
  });

  describe('create', () => {
    it('creates a tier with zero references', async () => {
      const res = await createTier({
        key: keyFor('wholesale'),
        label: 'E2E Wholesale',
      });

      expect(res.status).toBe(201);
      expect(res.data).toEqual({
        id: expect.any(String),
        key: keyFor('wholesale'),
        label: 'E2E Wholesale',
        userCount: 0,
        priceCount: 0,
        sortOrder: expect.any(Number),
        updatedAt: expect.any(String),
      });
    });

    it('refuses a duplicate key with 409', async () => {
      const key = keyFor('dupe');
      expect((await createTier({ key, label: 'First' })).status).toBe(201);

      const res = await createTier({ key, label: 'Second' });
      expect(res.status).toBe(409);
    });

    it('refuses the reserved key `default`', async () => {
      const res = await createTier({ key: 'default', label: 'Base list' });
      expect(res.status).toBe(400);
    });

    it('refuses a key that would not survive a sync column', async () => {
      for (const key of ['Wholesale', 'whole sale', '-leading', 'ümlaut']) {
        expect((await createTier({ key, label: 'x' })).status).toBe(400);
      }
    });
  });

  describe('update', () => {
    it('renames a tier and changes its sync key', async () => {
      const created = await createTier({
        key: keyFor('rename'),
        label: 'Before',
      });

      const res = await put(`/admin/tiers/${created.data.id}`, {
        key: keyFor('renamed'),
        label: 'After',
      });

      expect(res.status).toBe(200);
      expect(res.data.key).toBe(keyFor('renamed'));
      expect(res.data.label).toBe('After');
    });

    it('allows a tier to keep its own key', async () => {
      const key = keyFor('same-key');
      const created = await createTier({ key, label: 'Label' });

      const res = await put(`/admin/tiers/${created.data.id}`, {
        key,
        label: 'New label',
      });
      expect(res.status).toBe(200);
    });

    it("refuses another tier's key with 409", async () => {
      const taken = await createTier({ key: keyFor('taken'), label: 'Taken' });
      const other = await createTier({ key: keyFor('other'), label: 'Other' });

      const res = await put(`/admin/tiers/${other.data.id}`, {
        key: taken.data.key,
        label: 'Other',
      });
      expect(res.status).toBe(409);
    });

    it('404s on an unknown id', async () => {
      const res = await put(
        '/admin/tiers/00000000-0000-4000-8000-000000000000',
        { key: keyFor('ghost'), label: 'Ghost' },
      );
      expect(res.status).toBe(404);
    });
  });

  describe('delete', () => {
    it('deletes an unreferenced tier', async () => {
      const created = await createTier({
        key: keyFor('disposable'),
        label: 'Disposable',
      });

      expect((await del(`/admin/tiers/${created.data.id}`)).status).toBe(200);
      const list = await get('/admin/tiers');
      expect(list.data.tiers.map((t: { id: string }) => t.id)).not.toContain(
        created.data.id,
      );
    });

    it('refuses a tier that still has accounts, and reports the count', async () => {
      const created = await createTier({
        key: keyFor('with-users'),
        label: 'With users',
      });
      await client.query('UPDATE users SET "tierId" = $1 WHERE email = $2', [
        created.data.id,
        USER_EMAIL,
      ]);

      const res = await del(`/admin/tiers/${created.data.id}`);
      expect(res.status).toBe(409);
      expect(res.data.message).toContain('1');

      // The list keeps reporting why, so the admin can act on it.
      const list = await get('/admin/tiers');
      const row = list.data.tiers.find(
        (t: { id: string }) => t.id === created.data.id,
      );
      expect(row.userCount).toBe(1);

      await client.query('UPDATE users SET "tierId" = NULL WHERE email = $1', [
        USER_EMAIL,
      ]);
    });

    it('refuses a tier that still prices products', async () => {
      const created = await createTier({
        key: keyFor('with-prices'),
        label: 'With prices',
      });
      await client.query(
        `INSERT INTO product_prices ("productId", "tierId", "priceMinor")
         SELECT id, $1, 999 FROM products WHERE "deletedAt" IS NULL LIMIT 1`,
        [created.data.id],
      );

      const res = await del(`/admin/tiers/${created.data.id}`);
      expect(res.status).toBe(409);

      const list = await get('/admin/tiers');
      const row = list.data.tiers.find(
        (t: { id: string }) => t.id === created.data.id,
      );
      expect(row.priceCount).toBe(1);

      await client.query('DELETE FROM product_prices WHERE "tierId" = $1', [
        created.data.id,
      ]);
      expect((await del(`/admin/tiers/${created.data.id}`)).status).toBe(200);
    });

    it('404s on an unknown id', async () => {
      const res = await del(
        '/admin/tiers/00000000-0000-4000-8000-000000000000',
      );
      expect(res.status).toBe(404);
    });
  });

  describe('the base list', () => {
    it('counts the customers on it, and no staff', async () => {
      const before = (await get('/admin/tiers')).data.defaultUserCount;

      // The seeded admin and manager also carry a null tierId; only the
      // customer may move the number.
      const created = await createTier({
        key: keyFor('base-count'),
        label: 'Base count',
      });
      await client.query('UPDATE users SET "tierId" = $1 WHERE email = $2', [
        created.data.id,
        USER_EMAIL,
      ]);
      expect((await get('/admin/tiers')).data.defaultUserCount).toBe(
        before - 1,
      );

      await client.query('UPDATE users SET "tierId" = NULL WHERE email = $1', [
        USER_EMAIL,
      ]);
      expect((await get('/admin/tiers')).data.defaultUserCount).toBe(before);
    });

    it('leaves staff out of a tier count as well', async () => {
      const created = await createTier({
        key: keyFor('staff-count'),
        label: 'Staff count',
      });
      // Not a real scenario — tiers are assigned to customers — but the count
      // must say what it means if it ever happens.
      await client.query('UPDATE users SET "tierId" = $1 WHERE email = $2', [
        created.data.id,
        MANAGER_EMAIL,
      ]);

      const list = await get('/admin/tiers');
      const row = list.data.tiers.find(
        (t: { id: string }) => t.id === created.data.id,
      );
      expect(row.userCount).toBe(0);

      // The delete guard counts the reference anyway: it stands in for a
      // restricting foreign key, which does not care about roles.
      expect((await del(`/admin/tiers/${created.data.id}`)).status).toBe(409);

      await client.query('UPDATE users SET "tierId" = NULL WHERE email = $1', [
        MANAGER_EMAIL,
      ]);
    });
  });

  it('falls back to the label when two tiers share a position', async () => {
    const zulu = await createTier({
      key: keyFor('zzz'),
      label: `E2E ${R} zzZulu`,
    });
    const alpha = await createTier({
      key: keyFor('aaa'),
      label: `E2E ${R} zzAlpha`,
    });
    // Creation appends, so these differ by position; flatten them to make the
    // tiebreak the only thing left to order by.
    await client.query(
      'UPDATE customer_tiers SET "sortOrder" = 0 WHERE id = ANY($1)',
      [[zulu.data.id, alpha.data.id]],
    );

    const res = await get('/admin/tiers');
    expect(res.status).toBe(200);

    const labels = res.data.tiers
      .map((t: { label: string }) => t.label)
      .filter((l: string) => l.startsWith(`E2E ${R} zz`));
    expect(labels).toEqual([...labels].sort());
  });

  describe('display order', () => {
    it('appends a new tier after the ones already placed', async () => {
      const first = await createTier({
        key: keyFor('order-1'),
        label: `E2E ${R} order one`,
      });
      const second = await createTier({
        key: keyFor('order-2'),
        label: `E2E ${R} order two`,
      });

      expect(second.data.sortOrder).toBeGreaterThan(first.data.sortOrder);
    });

    it('applies a posted order and lists tiers in it', async () => {
      const one = await createTier({
        key: keyFor('seq-a'),
        label: `E2E ${R} seq A`,
      });
      const two = await createTier({
        key: keyFor('seq-b'),
        label: `E2E ${R} seq B`,
      });

      // Deliberately against the alphabet, so the assertion cannot pass by
      // falling back to the label tiebreak.
      const res = await patch('/admin/tiers/order', {
        order: [
          { id: two.data.id, sortOrder: -2 },
          { id: one.data.id, sortOrder: -1 },
        ],
      });
      expect(res.status).toBe(200);

      const ids = res.data.tiers
        .map((t: { id: string }) => t.id)
        .filter((id: string) => id === one.data.id || id === two.data.id);
      expect(ids).toEqual([two.data.id, one.data.id]);

      const listed = (await get('/admin/tiers')).data.tiers
        .map((t: { id: string }) => t.id)
        .filter((id: string) => id === one.data.id || id === two.data.id);
      expect(listed).toEqual([two.data.id, one.data.id]);
    });

    it('404s an unknown tier and changes nothing', async () => {
      const existing = await createTier({
        key: keyFor('seq-guard'),
        label: `E2E ${R} seq guard`,
      });
      const before = existing.data.sortOrder;

      const res = await patch('/admin/tiers/order', {
        order: [
          { id: existing.data.id, sortOrder: 99 },
          { id: '00000000-0000-4000-8000-000000000000', sortOrder: 100 },
        ],
      });
      expect(res.status).toBe(404);

      // The whole order is refused, not partly applied.
      const listed = (await get('/admin/tiers')).data.tiers.find(
        (t: { id: string }) => t.id === existing.data.id,
      );
      expect(listed.sortOrder).toBe(before);
    });

    it('is admin-only like the rest of the surface', async () => {
      expect(
        (await patch('/admin/tiers/order', { order: [] }, managerCookie))
          .status,
      ).toBe(403);
    });
  });
});
