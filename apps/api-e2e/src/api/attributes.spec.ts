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
  const SIZES = nameFor('Size');
  const DRILL = nameFor('Drill');
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

    // Two products carry the drill-down key, one of them twice, so the grid
    // has to count it once.
    await addProduct('drill-1', [
      { key: DRILL, value: 'twice' },
      { key: DRILL, value: 'again' },
    ]);
    await addProduct('drill-2', [{ key: DRILL, value: 'other' }]);
    // Three products carry Width: one numeric value, one that reads as text
    // ("ca. 30"), and a soft-deleted one — which counts, because a rename
    // rewrites it and the admin grid shows it.
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
      // All three, the soft-deleted one included: these counts describe the
      // catalog as stored, which is the set a rename rewrites and the set the
      // drill-down lands on. "ca. 30" is a value like any other, and reported
      // as the one with no numeric form.
      expect(res.data.productCount).toBe(3);
      expect(res.data.valueCount).toBe(3);
      expect(res.data.unparsedCount).toBe(1);
    });

    it('drops a unit sent for a text attribute — "Blue cm" is not a value', async () => {
      const res = await createDefinition({
        name: nameFor('Finish'),
        type: 'text',
        unit: 'cm',
      });

      expect(res.status).toBe(201);
      expect(res.data.unit).toBeNull();
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

  describe('inventory (FR-ATTR-09)', () => {
    it('lists freetext keys as well as declared ones, alphabetically', async () => {
      const res = await get('/admin/attributes/inventory');

      expect(res.status).toBe(200);
      const keys = res.data.keys.map((k: { key: string }) => k.key);
      // HEIGHT carries no definition of its own at this point; it is listed
      // all the same, which is the point of the inventory.
      expect(keys).toContain(HEIGHT);
      expect(keys).toContain(WIDTH);
      expect([...keys]).toEqual([...keys].sort());
    });

    it('reports the definition a key matches, with its type', async () => {
      const res = await get('/admin/attributes/inventory');
      const entry = res.data.keys.find((k: { key: string }) => k.key === WIDTH);

      expect(entry.productCount).toBe(3);
      expect(entry.valueCount).toBe(3);
      expect(entry.definition).toEqual({
        id: expect.any(String),
        type: 'number',
      });
    });

    it('orders values numerically, and says which have no numeric form', async () => {
      const product = await addProduct('sizes', [
        { key: SIZES, value: '100', numeric: 100 },
        { key: SIZES, value: '9', numeric: 9 },
      ]);
      await addProduct('sizes-2', [{ key: SIZES, value: 'ca. 30' }]);

      const res = await get(
        `/admin/attributes/inventory/values?key=${encodeURIComponent(SIZES)}`,
      );

      expect(res.status).toBe(200);
      // 9 before 100 — a list of sizes ordered as text is unusable — and the
      // unparseable one last.
      expect(res.data.values).toEqual([
        { value: '9', productCount: 1, numeric: true },
        { value: '100', productCount: 1, numeric: true },
        { value: 'ca. 30', productCount: 1, numeric: false },
      ]);
      expect(product).toEqual(expect.any(String));
    });

    it('renames a key across every product, deleted ones included', async () => {
      const res = await post('/admin/attributes/inventory/rename-key', {
        from: HEIGHT,
        to: `${HEIGHT} fixed`,
      });

      expect(res.status).toBe(200);
      expect(res.data.updated).toBe(1);

      const { rows } = await client.query(
        'SELECT count(*)::int AS n FROM product_attributes WHERE key = $1',
        [HEIGHT],
      );
      expect(rows[0].n).toBe(0);
    });

    it('merges two spellings into one, which is what a rename usually is', async () => {
      const typo = `${WIDTH} typo`;
      await addProduct('typo', [{ key: typo, value: '30', numeric: 30 }]);

      const res = await post('/admin/attributes/inventory/rename-key', {
        from: typo,
        to: WIDTH,
      });

      expect(res.data.updated).toBe(1);
      const entry = (await get('/admin/attributes/inventory')).data.keys.find(
        (k: { key: string }) => k.key === WIDTH,
      );
      // The merged product joins the three that already carried the key, and
      // its "30" is a value one of them had, so the value count holds.
      expect(entry.productCount).toBe(4);
      expect(entry.valueCount).toBe(3);
    });

    it('re-parses a renamed value, so a corrected number rejoins the filter', async () => {
      const res = await post('/admin/attributes/inventory/rename-value', {
        key: WIDTH,
        from: 'ca. 30',
        to: '30',
      });

      expect(res.status).toBe(200);
      expect(res.data.updated).toBe(1);

      const { rows } = await client.query(
        `SELECT "valueNumeric" FROM product_attributes
         WHERE key = $1 AND value = '30'`,
        [WIDTH],
      );
      expect(rows.every((r) => r.valueNumeric !== null)).toBe(true);
    });

    it('scopes a value rename to its key', async () => {
      await addProduct('scoped', [{ key: SIZES, value: 'shared' }]);
      await addProduct('scoped-2', [{ key: HEIGHT, value: 'shared' }]);

      const res = await post('/admin/attributes/inventory/rename-value', {
        key: SIZES,
        from: 'shared',
        to: 'renamed',
      });

      expect(res.data.updated).toBe(1);
      const { rows } = await client.query(
        `SELECT count(*)::int AS n FROM product_attributes
         WHERE key = $1 AND value = 'shared'`,
        [HEIGHT],
      );
      expect(rows[0].n).toBe(1);
    });

    it('rejects a manager, like the rest of this surface', async () => {
      expect(
        (await get('/admin/attributes/inventory', managerCookie)).status,
      ).toBe(403);
      expect(
        (
          await post(
            '/admin/attributes/inventory/rename-key',
            { from: WIDTH, to: 'Nope' },
            managerCookie,
          )
        ).status,
      ).toBe(403);
    });
  });

  describe('drill-down into the admin product list (FR-ADM-05)', () => {
    it('filters the grid by an attribute key', async () => {
      const res = await get(
        `/admin/catalog/products?attributeKey=${encodeURIComponent(DRILL)}`,
      );

      expect(res.status).toBe(200);
      // Two products carry it; the third product carrying nothing does not.
      expect(res.data.items).toHaveLength(2);
    });

    it('narrows to one value, and counts a product once however many rows match', async () => {
      const res = await get(
        `/admin/catalog/products?attributeKey=${encodeURIComponent(DRILL)}` +
          `&attributeValue=twice`,
      );

      expect(res.data.items).toHaveLength(1);
      expect(res.data.pagination.total).toBe(1);
    });

    it('ignores a value with no key rather than filtering on it', async () => {
      const res = await get('/admin/catalog/products?attributeValue=twice');

      // One product carries "twice"; without a key the parameter means
      // nothing, so the grid still holds the whole seeded catalog. Compared
      // loosely on purpose — other suites are creating products alongside.
      expect(res.data.pagination.total).toBeGreaterThan(10);
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
