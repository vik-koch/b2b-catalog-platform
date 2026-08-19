import { hash } from '@node-rs/argon2';
import axios from 'axios';
import { Client } from 'pg';
import { requireEnv } from '../support/env';

/**
 * The filterable-attribute registry (FR-ATTR-01; NFR-SEC-04 for the guards).
 *
 * Against the real database on purpose: what this surface actually asserts is
 * that a definition matches product attribute rows by name *exactly*, and that
 * the counts it reports come from the catalog as staff see it — neither is
 * provable against a stubbed driver.
 */

const ADMIN_EMAIL = 'e2e-attributes-admin@example.com';
const MANAGER_EMAIL = 'e2e-attributes-manager@example.com';
const USER_EMAIL = 'e2e-attributes-user@example.com';
const PASSWORD = 'e2e-attributes-password';

// Per-run suffix, so leftovers from a crashed run cannot collide with this
// run's names.
const R = Date.now().toString(36);
const nameFor = (name: string) => `E2E ${name} ${R}`;

async function loginAs(email: string): Promise<string> {
  const res = await axios.post('/auth/login', { email, password: PASSWORD });
  const cookie = (res.headers['set-cookie'] as string[] | undefined)
    ?.find((c) => c.startsWith('session='))
    ?.split(';')[0];
  if (!cookie) throw new Error(`login failed for ${email}`);
  return cookie;
}

describe('Filterable attributes admin (FR-ATTR-01)', () => {
  let client: Client;
  let adminCookie = '';
  let managerCookie = '';
  let userCookie = '';
  const createdIds: string[] = [];
  // The catalog the counts are taken over, created directly in the database:
  // this suite is about the registry, not about product editing.
  const WIDTH = nameFor('Width');
  const HEIGHT = nameFor('Height');
  const DOOMED = nameFor('Doomed');
  let categoryId = '';

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

  async function createDefinition(body: Record<string, unknown>) {
    const res = await post('/admin/attributes', body);
    if (res.status === 201) createdIds.push(res.data.id);
    return res;
  }

  /** The definition as the list currently reports it. */
  async function listed(id: string) {
    const res = await get('/admin/attributes');
    return res.data.definitions.find((d: { id: string }) => d.id === id);
  }

  async function addProduct(
    suffix: string,
    attributes: { key: string; value: string; numeric?: number }[],
    options: { deleted?: boolean } = {},
  ): Promise<string> {
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO products ("sourceId", slug, name, "defaultPriceMinor",
                             "categoryId", "deletedAt")
       VALUES ($1, $1, $1, 100, $2, $3) RETURNING id`,
      [
        `e2e-attr-${R}-${suffix}`,
        categoryId,
        options.deleted ? new Date() : null,
      ],
    );
    const id = rows[0].id;
    for (const [i, attribute] of attributes.entries()) {
      await client.query(
        `INSERT INTO product_attributes ("productId", "sortOrder", key, value,
                                         "valueNumeric")
         VALUES ($1, $2, $3, $4, $5)`,
        [id, i, attribute.key, attribute.value, attribute.numeric ?? null],
      );
    }
    return id;
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

    const category = await client.query<{ id: string }>(
      `INSERT INTO categories ("sourceId", slug, name)
       VALUES ($1, $1, $1) RETURNING id`,
      [`e2e-attr-${R}`],
    );
    categoryId = category.rows[0].id;

    // Two products carry Width: one numeric value, one that reads as text
    // ("ca. 30"). A third product is soft-deleted and must not count at all.
    await addProduct('a', [
      { key: WIDTH, value: '30', numeric: 30 },
      // Two keys no definition holds yet, for the rename and the delete.
      { key: HEIGHT, value: '12', numeric: 12 },
      { key: DOOMED, value: 'x' },
    ]);
    await addProduct('b', [{ key: WIDTH, value: 'ca. 30' }]);
    await addProduct('gone', [{ key: WIDTH, value: '99', numeric: 99 }], {
      deleted: true,
    });

    adminCookie = await loginAs(ADMIN_EMAIL);
    managerCookie = await loginAs(MANAGER_EMAIL);
    userCookie = await loginAs(USER_EMAIL);
  });

  afterAll(async () => {
    await client.query('DELETE FROM attribute_definitions WHERE id = ANY($1)', [
      createdIds,
    ]);
    // product_attributes cascade with their product.
    await client.query('DELETE FROM products WHERE "categoryId" = $1', [
      categoryId,
    ]);
    await client.query('DELETE FROM categories WHERE id = $1', [categoryId]);
    await client.query('DELETE FROM users WHERE email = ANY($1)', [
      [ADMIN_EMAIL, MANAGER_EMAIL, USER_EMAIL],
    ]);
    await client.end();
  });

  describe('guards (NFR-SEC-04)', () => {
    it('rejects an anonymous caller with 401', async () => {
      expect((await get('/admin/attributes', '')).status).toBe(401);
    });

    it('rejects a manager: what the shop filters by is a catalog decision', async () => {
      expect((await get('/admin/attributes', managerCookie)).status).toBe(403);
    });

    it('rejects a customer with 403', async () => {
      expect((await get('/admin/attributes', userCookie)).status).toBe(403);
    });
  });

  describe('create', () => {
    it('creates a definition and derives its slug from the name', async () => {
      const res = await createDefinition({
        name: nameFor('Colour'),
        type: 'text',
        unit: null,
      });

      expect(res.status).toBe(201);
      expect(res.data).toEqual({
        id: expect.any(String),
        name: nameFor('Colour'),
        slug: expect.stringContaining('e2e-colour'),
        type: 'text',
        unit: null,
        sortOrder: expect.any(Number),
        productCount: 0,
        valueCount: 0,
        unparsedCount: 0,
        updatedAt: expect.any(String),
      });
    });

    it('counts the products already carrying the key — no product is re-entered', async () => {
      const res = await createDefinition({
        name: WIDTH,
        type: 'number',
        unit: 'cm',
      });

      expect(res.status).toBe(201);
      // The soft-deleted third product is out of the catalog, so out of the
      // counts; "ca. 30" is counted as a value and reported as unparseable.
      expect(res.data.productCount).toBe(2);
      expect(res.data.valueCount).toBe(2);
      expect(res.data.unparsedCount).toBe(1);
    });

    it('matches exactly: a mistyped name matches nothing', async () => {
      const res = await createDefinition({
        name: `${WIDTH.toLowerCase()} `,
        type: 'number',
        unit: null,
      });

      expect(res.status).toBe(201);
      // Trimmed, but not casefolded — that is the whole rule in one row.
      expect(res.data.name).toBe(WIDTH.toLowerCase());
      expect(res.data.productCount).toBe(0);
    });

    it('refuses a duplicate name with 409', async () => {
      const name = nameFor('Dupe');
      expect((await createDefinition({ name, type: 'text' })).status).toBe(201);

      const res = await createDefinition({ name, type: 'text' });
      expect(res.status).toBe(409);
      expect(res.data.code).toBe('attribute-name-taken');
    });

    it('refuses a slug another definition already uses', async () => {
      const slug = `e2e-slug-${R}`;
      expect(
        (
          await createDefinition({
            name: nameFor('Slug A'),
            type: 'text',
            slug,
          })
        ).status,
      ).toBe(201);

      const res = await createDefinition({
        name: nameFor('Slug B'),
        type: 'text',
        slug,
      });
      expect(res.status).toBe(409);
      expect(res.data.code).toBe('attribute-slug-taken');
    });

    it('refuses a third type', async () => {
      const res = await createDefinition({
        name: nameFor('Odd'),
        type: 'integer',
      });
      expect(res.status).toBe(400);
    });
  });

  describe('update', () => {
    it('re-points a definition at the spelling the products carry', async () => {
      // The correction path for a mistyped definition: nothing is rebuilt and
      // no product is touched, because the row's numeric form was parsed when
      // the attribute was stored, whatever the definition says.
      const created = await createDefinition({
        name: `${HEIGHT} mistyped`,
        type: 'number',
        unit: null,
      });
      expect(created.data.productCount).toBe(0);

      const res = await put(`/admin/attributes/${created.data.id}`, {
        name: HEIGHT,
        type: 'number',
        unit: 'cm',
      });

      expect(res.status).toBe(200);
      expect(res.data.unit).toBe('cm');
      expect(res.data.productCount).toBe(1);
      expect(res.data.unparsedCount).toBe(0);
    });

    it('refuses a name another definition already holds', async () => {
      const created = await createDefinition({
        name: nameFor('Clash'),
        type: 'text',
      });

      const res = await put(`/admin/attributes/${created.data.id}`, {
        name: WIDTH,
        type: 'text',
      });

      expect(res.status).toBe(409);
      expect(res.data.code).toBe('attribute-name-taken');
    });

    it('keeps the slug when only the name changes, so shared links survive', async () => {
      const created = await createDefinition({
        name: nameFor('Stable'),
        type: 'text',
      });

      const res = await put(`/admin/attributes/${created.data.id}`, {
        name: nameFor('Renamed'),
        type: 'text',
      });

      expect(res.status).toBe(200);
      expect(res.data.slug).toBe(created.data.slug);
    });

    it('404s on an unknown id', async () => {
      const res = await put(
        '/admin/attributes/00000000-0000-0000-0000-000000000000',
        { name: nameFor('Ghost'), type: 'text' },
      );
      expect(res.status).toBe(404);
      expect(res.data.code).toBe('attribute-not-found');
    });
  });

  describe('order', () => {
    it('applies a whole filter-panel order', async () => {
      const first = await createDefinition({
        name: nameFor('Order A'),
        type: 'text',
      });
      const second = await createDefinition({
        name: nameFor('Order B'),
        type: 'text',
      });

      const res = await patch('/admin/attributes/order', {
        order: [
          { id: second.data.id, sortOrder: 0 },
          { id: first.data.id, sortOrder: 1 },
        ],
      });

      expect(res.status).toBe(200);
      const ids = res.data.definitions.map((d: { id: string }) => d.id);
      expect(ids.indexOf(second.data.id)).toBeLessThan(
        ids.indexOf(first.data.id),
      );
    });

    it('404s when the order names a definition that is gone', async () => {
      const res = await patch('/admin/attributes/order', {
        order: [{ id: '00000000-0000-0000-0000-000000000000', sortOrder: 0 }],
      });
      expect(res.status).toBe(404);
    });
  });

  describe('delete', () => {
    it('deletes without a guard, and leaves the product attributes alone', async () => {
      const created = await createDefinition({
        name: DOOMED,
        type: 'text',
      });
      expect(created.data.productCount).toBe(1);

      expect((await del(`/admin/attributes/${created.data.id}`)).status).toBe(
        200,
      );
      expect(await listed(created.data.id)).toBeUndefined();

      // The product keeps the attribute: deleting a definition is metadata
      // only, and the product page goes on showing the value.
      const { rows } = await client.query(
        'SELECT count(*)::int AS n FROM product_attributes WHERE key = $1',
        [DOOMED],
      );
      expect(rows[0].n).toBe(1);
    });

    it('404s on an unknown id', async () => {
      const res = await del(
        '/admin/attributes/00000000-0000-0000-0000-000000000000',
      );
      expect(res.status).toBe(404);
    });
  });
});
