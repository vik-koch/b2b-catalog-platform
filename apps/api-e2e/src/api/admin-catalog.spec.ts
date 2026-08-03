import { hash } from '@node-rs/argon2';
import { ADMIN_CATALOG_PAGE_SIZE } from '@b2b-catalog-platform/shared';
import axios from 'axios';
import { Client } from 'pg';
import { requireEnv } from '../support/env';

/**
 * The admin catalog write surface, exercised end-to-end against the real API
 * and database: auth guards, slug transliteration + uniqueness, write
 * sanitization, soft delete/restore, and the category guards (cycle, non-empty
 * delete).
 *
 * Isolation: every row is created under the seeded `cleaning` category, whose
 * children and products `catalog.spec` never inspects — so these mutations stay
 * invisible to the parallel storefront specs. All created rows are tracked and
 * removed in afterAll.
 */

const ADMIN_EMAIL = 'e2e-admincat-admin@example.com';
const MANAGER_EMAIL = 'e2e-admincat-manager@example.com';
const PASSWORD = 'e2e-admincat-password';

// Per-run suffix so a previous crashed run's leftovers can't collide with this
// run's slugs/sourceIds.
const R = Date.now().toString(36);

const PRODUCT_KEYS = [
  'attributes',
  'categoryId',
  'deletedAt',
  'descriptionHtml',
  'images',
  'name',
  'priceMinor',
  'slug',
  'sourceId',
  'updatedAt',
];
const CATEGORY_KEYS = [
  'childCount',
  'description',
  'id',
  'image',
  'name',
  'parentId',
  'productCount',
  'slug',
  'sortOrder',
];

function sessionCookie(setCookie: string[] | undefined): string {
  const cookie = setCookie
    ?.find((c) => c.startsWith('session='))
    ?.split(';')[0];
  if (!cookie) throw new Error('expected a session cookie');
  return cookie;
}

async function loginAs(email: string): Promise<string> {
  const res = await axios.post('/auth/login', { email, password: PASSWORD });
  return sessionCookie(res.headers['set-cookie']);
}

describe('Admin catalog (FR-ADM-01)', () => {
  let client: Client;
  let adminCookie: string;
  let parentId: string;
  const createdProductSlugs: string[] = [];
  const createdCategoryIds: string[] = [];

  const post = (url: string, body: unknown, cookie = adminCookie) =>
    axios.post(url, body, {
      headers: cookie ? { Cookie: cookie } : {},
      validateStatus: () => true,
    });
  const put = (url: string, body: unknown, cookie = adminCookie) =>
    axios.put(url, body, {
      headers: cookie ? { Cookie: cookie } : {},
      validateStatus: () => true,
    });
  const patch = (url: string, body: unknown, cookie = adminCookie) =>
    axios.patch(url, body, {
      headers: cookie ? { Cookie: cookie } : {},
      validateStatus: () => true,
    });
  const del = (url: string, cookie = adminCookie) =>
    axios.delete(url, {
      headers: cookie ? { Cookie: cookie } : {},
      validateStatus: () => true,
    });
  const adminGet = (url: string, cookie = adminCookie) =>
    axios.get(url, {
      headers: cookie ? { Cookie: cookie } : {},
      validateStatus: () => true,
    });

  /** Create a product under the test parent and track it for cleanup. */
  async function createProduct(overrides: Record<string, unknown> = {}) {
    const res = await post('/admin/catalog/products', {
      name: `E2E Product ${R}-${createdProductSlugs.length}`,
      priceMinor: 1234,
      categoryId: parentId,
      ...overrides,
    });
    if (res.status === 201) createdProductSlugs.push(res.data.slug);
    return res;
  }

  /** Create a category and track it for cleanup. */
  async function createCategory(overrides: Record<string, unknown> = {}) {
    const res = await post('/admin/catalog/categories', {
      name: `E2E Category ${R}-${createdCategoryIds.length}`,
      parentId,
      ...overrides,
    });
    if (res.status === 201) createdCategoryIds.push(res.data.id);
    return res;
  }

  beforeAll(async () => {
    client = new Client({ connectionString: requireEnv('DATABASE_URL') });
    await client.connect();

    const passwordHash = await hash(PASSWORD);
    for (const [email, role] of [
      [ADMIN_EMAIL, 'admin'],
      [MANAGER_EMAIL, 'manager'],
    ] as const) {
      await client.query('DELETE FROM users WHERE email = $1', [email]);
      await client.query(
        `INSERT INTO users (email, "passwordHash", role) VALUES ($1, $2, $3)`,
        [email, passwordHash, role],
      );
    }
    adminCookie = await loginAs(ADMIN_EMAIL);

    const { rows } = await client.query(
      'SELECT id FROM categories WHERE slug = $1',
      ['cleaning'],
    );
    parentId = rows[0].id;
  });

  afterAll(async () => {
    // Products first (categoryId FK is `restrict`), then categories.
    for (const slug of createdProductSlugs) {
      await client.query('DELETE FROM products WHERE slug = $1', [slug]);
    }
    for (const id of createdCategoryIds) {
      await client.query('DELETE FROM categories WHERE id = $1', [id]);
    }
    await client.query('DELETE FROM users WHERE email = ANY($1)', [
      [ADMIN_EMAIL, MANAGER_EMAIL],
    ]);
    await client.end();
  });

  describe('authorization', () => {
    it('rejects an anonymous create with 401', async () => {
      const res = await post(
        '/admin/catalog/products',
        { name: 'x', priceMinor: 1, categoryId: parentId },
        '',
      );
      expect(res.status).toBe(401);
    });

    it('rejects a manager with 403 — the catalog is admin-only', async () => {
      const res = await post(
        '/admin/catalog/products',
        { name: 'x', priceMinor: 1, categoryId: parentId },
        await loginAs(MANAGER_EMAIL),
      );
      expect(res.status).toBe(403);
    });
  });

  describe('POST /admin/catalog/products', () => {
    it('creates a product in exactly the admin shape, no internal columns', async () => {
      const res = await createProduct({ name: `Widget ${R}` });

      expect(res.status).toBe(201);
      expect(Object.keys(res.data).sort()).toEqual(PRODUCT_KEYS);
      expect(res.data.deletedAt).toBeNull();
      expect(res.data).not.toHaveProperty('id');
    });

    it('transliterates a non-Latin name into a URL-safe slug', async () => {
      const res = await createProduct({ name: 'Молоко Тест' });

      expect(res.status).toBe(201);
      expect(res.data.slug).toMatch(/^moloko-test/);
    });

    it('mints a manual: sourceId when none is supplied', async () => {
      const res = await createProduct({ name: `NoSource ${R}` });

      expect(res.status).toBe(201);
      expect(res.data.sourceId).toMatch(/^manual:/);
    });

    it('appends a numeric suffix to keep an auto slug unique', async () => {
      const name = `Dup ${R}`;
      const first = await createProduct({ name });
      const second = await createProduct({ name });

      expect(second.status).toBe(201);
      expect(second.data.slug).toBe(`${first.data.slug}-2`);
    });

    it('sanitizes the description on write (column, not just response)', async () => {
      const res = await createProduct({
        name: `Sanitize ${R}`,
        descriptionHtml:
          '<h2>Heading</h2><p>Keep <strong>bold</strong> and <a href="http://x">link</a></p><script>alert(1)</script>',
      });

      const expected = 'Heading<p>Keep <strong>bold</strong> and link</p>';
      expect(res.data.descriptionHtml).toBe(expected);
      const { rows } = await client.query(
        'SELECT "descriptionHtml" FROM products WHERE slug = $1',
        [res.data.slug],
      );
      expect(rows[0].descriptionHtml).toBe(expected);
    });

    it('rejects a duplicate explicit slug with 409', async () => {
      const slug = `e2e-taken-${R}`;
      await createProduct({ name: `Taken ${R}`, slug });
      const res = await createProduct({ name: `Taken again ${R}`, slug });

      expect(res.status).toBe(409);
    });

    it('rejects a duplicate sourceId with 409', async () => {
      const sourceId = `e2e-src-${R}`;
      await createProduct({ name: `Src ${R}`, sourceId });
      const res = await createProduct({ name: `Src again ${R}`, sourceId });

      expect(res.status).toBe(409);
    });

    it('rejects an unknown category with 404', async () => {
      const res = await post('/admin/catalog/products', {
        name: 'orphan',
        priceMinor: 1,
        categoryId: '00000000-0000-0000-0000-000000000000',
      });
      expect(res.status).toBe(404);
    });
  });

  describe('PUT /admin/catalog/products/:slug', () => {
    it('keeps the slug stable across a rename', async () => {
      const created = await createProduct({ name: `Rename ${R}` });
      const slug = created.data.slug;

      const res = await put(`/admin/catalog/products/${slug}`, {
        name: `Renamed ${R}`,
        priceMinor: 999,
        categoryId: parentId,
      });

      expect(res.status).toBe(200);
      expect(res.data.slug).toBe(slug);
      expect(res.data.name).toBe(`Renamed ${R}`);
    });

    it('changes the slug when an override is given, and 409s on a taken one', async () => {
      const a = await createProduct({ name: `Move A ${R}` });
      const b = await createProduct({ name: `Move B ${R}` });

      const newSlug = `e2e-moved-${R}`;
      const ok = await put(`/admin/catalog/products/${a.data.slug}`, {
        name: a.data.name,
        slug: newSlug,
        priceMinor: 1,
        categoryId: parentId,
      });
      expect(ok.status).toBe(200);
      expect(ok.data.slug).toBe(newSlug);
      createdProductSlugs.push(newSlug); // track the new handle for cleanup

      const clash = await put(`/admin/catalog/products/${b.data.slug}`, {
        name: b.data.name,
        slug: newSlug,
        priceMinor: 1,
        categoryId: parentId,
      });
      expect(clash.status).toBe(409);
    });

    it('404s an unknown product', async () => {
      const res = await put('/admin/catalog/products/does-not-exist', {
        name: 'x',
        priceMinor: 1,
        categoryId: parentId,
      });
      expect(res.status).toBe(404);
    });
  });

  describe('soft delete / restore', () => {
    it('hides a deleted product from the storefront but keeps it for the admin, then restores it', async () => {
      const created = await createProduct({ name: `Delete ${R}` });
      const slug = created.data.slug;

      // Visible on the public read before deletion.
      const before = await axios.get(`/catalog/products/${slug}`, {
        validateStatus: () => true,
      });
      expect(before.status).toBe(200);

      const deleted = await del(`/admin/catalog/products/${slug}`);
      expect(deleted.status).toBe(200);
      expect(deleted.data.deletedAt).not.toBeNull();

      // Gone from the storefront...
      const publicRead = await axios.get(`/catalog/products/${slug}`, {
        validateStatus: () => true,
      });
      expect(publicRead.status).toBe(404);

      // ...but still loadable by the admin and listed with its deleted flag.
      const adminRead = await adminGet(`/admin/catalog/products/${slug}`);
      expect(adminRead.status).toBe(200);
      expect(adminRead.data.deletedAt).not.toBeNull();

      const list = await adminGet(
        `/admin/catalog/products?categoryId=${parentId}`,
      );
      expect(list.data.pagination.pageSize).toBe(ADMIN_CATALOG_PAGE_SIZE);
      const listed = list.data.items.find(
        (i: { slug: string }) => i.slug === slug,
      );
      expect(listed).toBeDefined();
      expect(listed.deletedAt).not.toBeNull();

      const restored = await post(
        `/admin/catalog/products/${slug}/restore`,
        {},
      );
      expect(restored.status).toBe(200);
      expect(restored.data.deletedAt).toBeNull();

      const after = await axios.get(`/catalog/products/${slug}`, {
        validateStatus: () => true,
      });
      expect(after.status).toBe(200);
    });

    it('is idempotent: a second delete keeps the original timestamps', async () => {
      const created = await createProduct({ name: `Idem ${R}` });
      const slug = created.data.slug;

      const first = await del(`/admin/catalog/products/${slug}`);
      expect(first.status).toBe(200);

      const second = await del(`/admin/catalog/products/${slug}`);
      expect(second.status).toBe(200);
      // The re-delete is a no-op: neither timestamp moves.
      expect(second.data.deletedAt).toBe(first.data.deletedAt);
      expect(second.data.updatedAt).toBe(first.data.updatedAt);
    });
  });

  /**
   * The grid's filter/search/sort surface (FR-ADM-05). Every case scopes to the
   * test parent category, so the assertions hold no matter what else the seeded
   * catalog contains — the point is which of *these* rows come back and in what
   * order, not global counts.
   */
  describe('GET /admin/catalog/products (FR-ADM-05)', () => {
    let liveSlug: string;
    let deletedSlug: string;
    let gridCategoryId: string;

    const grid = async (params: string) => {
      const res = await adminGet(
        `/admin/catalog/products?categoryId=${gridCategoryId}&${params}`,
      );
      expect(res.status).toBe(200);
      return res.data as {
        items: { slug: string; name: string; sourceId: string }[];
        pagination: { total: number };
      };
    };

    beforeAll(async () => {
      // A category of this suite's own, so paging and totals are predictable.
      const category = await createCategory({ name: `Grid ${R}` });
      gridCategoryId = category.data.id;

      const live = await createProduct({
        name: `Grid Espresso Roast ${R}`,
        categoryId: gridCategoryId,
        priceMinor: 500,
        sourceId: `grid:${R}-KEEP/1`,
      });
      liveSlug = live.data.slug;

      const deleted = await createProduct({
        name: `Grid Filter Blend ${R}`,
        categoryId: gridCategoryId,
        priceMinor: 900,
        sourceId: `grid:${R}-GONE/2`,
      });
      deletedSlug = deleted.data.slug;
      await del(`/admin/catalog/products/${deletedSlug}`);
    });

    it('shows both live and soft-deleted rows by default', async () => {
      const body = await grid('state=all');
      expect(body.items.map((i) => i.slug).sort()).toEqual(
        [liveSlug, deletedSlug].sort(),
      );
    });

    it.each([
      ['live', () => liveSlug, () => deletedSlug],
      ['deleted', () => deletedSlug, () => liveSlug],
    ])('filters to %s only', async (state, wanted, excluded) => {
      const body = await grid(`state=${state}`);
      expect(body.items.map((i) => i.slug)).toEqual([wanted()]);
      expect(body.items.map((i) => i.slug)).not.toContain(excluded());
      expect(body.pagination.total).toBe(1);
    });

    it('searches by name, typo included, across the delete state', async () => {
      // "esspreso" is a misspelling — the fuzzy half has to carry it.
      const body = await grid('q=esspreso');
      expect(body.items.map((i) => i.slug)).toEqual([liveSlug]);
    });

    it('searches by the private sync key, punctuation and all', async () => {
      // A key fragment the name half cannot match on any term — the point is
      // that the slashes and the case survive to reach the sourceId.
      const body = await grid(`q=${encodeURIComponent('GONE/2')}`);
      expect(body.items.map((i) => i.slug)).toEqual([deletedSlug]);
    });

    it('combines the search box with the state filter', async () => {
      // The name matches both rows; the state filter is what narrows it.
      const body = await grid('q=Grid&state=live');
      expect(body.items.map((i) => i.slug)).toEqual([liveSlug]);
    });

    it.each([
      ['price', ['Espresso', 'Filter']],
      ['price_desc', ['Filter', 'Espresso']],
      ['name', ['Espresso', 'Filter']],
      ['name_desc', ['Filter', 'Espresso']],
    ])('sorts by %s', async (sort, expected) => {
      const body = await grid(`sort=${sort}`);
      expect(
        body.items.map((i) =>
          i.name.includes('Espresso') ? 'Espresso' : 'Filter',
        ),
      ).toEqual(expected);
    });

    it('sorts by recency, most recently updated first', async () => {
      // The deleted row was touched last (the delete moved its updatedAt).
      const body = await grid('sort=updated_desc');
      expect(body.items[0].slug).toBe(deletedSlug);
      const oldest = await grid('sort=updated');
      expect(oldest.items[0].slug).toBe(liveSlug);
    });

    it('never leaks a match from another category', async () => {
      // The same query, unscoped, does find rows outside the grid category —
      // so the category filter is doing the narrowing above, not the query.
      const scoped = await grid('q=Grid');
      const unscoped = await adminGet(
        `/admin/catalog/products?q=${encodeURIComponent(`Grid ${R}`)}`,
      );
      expect(unscoped.data.pagination.total).toBeGreaterThanOrEqual(
        scoped.pagination.total,
      );
      for (const item of scoped.items) {
        expect([liveSlug, deletedSlug]).toContain(item.slug);
      }
    });
  });

  describe('GET /admin/catalog/categories/:slug/deleted-products', () => {
    it('lists soft-deleted products across the subtree, excluding live ones', async () => {
      // A deleted product directly under the parent, and one deleted under a
      // child category — both must surface (Pattern A aggregation). Plus a live
      // product that must not.
      const child = await createCategory({ name: `Deleted Sub ${R}` });
      const directDeleted = await createProduct({ name: `Direct Del ${R}` });
      const childDeleted = await createProduct({
        name: `Child Del ${R}`,
        categoryId: child.data.id,
      });
      const live = await createProduct({ name: `Still Live ${R}` });

      await del(`/admin/catalog/products/${directDeleted.data.slug}`);
      await del(`/admin/catalog/products/${childDeleted.data.slug}`);

      const res = await adminGet(
        '/admin/catalog/categories/cleaning/deleted-products',
      );
      expect(res.status).toBe(200);
      const slugs = res.data.items.map((i: { slug: string }) => i.slug);
      expect(slugs).toContain(directDeleted.data.slug);
      expect(slugs).toContain(childDeleted.data.slug);
      expect(slugs).not.toContain(live.data.slug);
      // Public tile shape only — no internal columns leak.
      expect(Object.keys(res.data.items[0]).sort()).toEqual([
        'images',
        'name',
        'priceMinor',
        'slug',
      ]);
    });

    it('404s an unknown category', async () => {
      const res = await adminGet(
        '/admin/catalog/categories/no-such-category/deleted-products',
      );
      expect(res.status).toBe(404);
    });

    it('rejects an anonymous request with 401', async () => {
      const res = await adminGet(
        '/admin/catalog/categories/cleaning/deleted-products',
        '',
      );
      expect(res.status).toBe(401);
    });
  });

  describe('categories', () => {
    it('creates a category in exactly the admin shape', async () => {
      const res = await createCategory({ name: `Cat Shape ${R}` });

      expect(res.status).toBe(201);
      expect(Object.keys(res.data).sort()).toEqual(CATEGORY_KEYS);
      expect(res.data.parentId).toBe(parentId);
      expect(res.data.productCount).toBe(0);
      expect(res.data.childCount).toBe(0);
    });

    it('404s a create under an unknown parent', async () => {
      const res = await post('/admin/catalog/categories', {
        name: 'orphan',
        parentId: '00000000-0000-0000-0000-000000000000',
      });
      expect(res.status).toBe(404);
    });

    it('reports product and child counts in the listing', async () => {
      const cat = await createCategory({ name: `Counted ${R}` });
      await createProduct({ name: `In Counted ${R}`, categoryId: cat.data.id });

      const res = await adminGet('/admin/catalog/categories');
      expect(res.status).toBe(200);
      const mine = res.data.categories.find(
        (c: { id: string }) => c.id === cat.data.id,
      );
      expect(mine.productCount).toBe(1);
    });

    it('refuses to delete a category that still has products (409)', async () => {
      const cat = await createCategory({ name: `NonEmpty ${R}` });
      await createProduct({ name: `Blocker ${R}`, categoryId: cat.data.id });

      const res = await del(`/admin/catalog/categories/${cat.data.id}`);
      expect(res.status).toBe(409);
    });

    it('reassigns products (including soft-deleted) to another category, then deletes it (200)', async () => {
      const src = await createCategory({ name: `Src ${R}` });
      const dest = await createCategory({ name: `Dest ${R}` });
      const live = await createProduct({
        name: `Live ${R}`,
        categoryId: src.data.id,
      });
      const gone = await createProduct({
        name: `Gone ${R}`,
        categoryId: src.data.id,
      });
      // Soft-delete one: it still carries the categoryId FK, so it must move too
      // or the delete would still be blocked.
      await del(`/admin/catalog/products/${gone.data.slug}`);

      const res = await del(
        `/admin/catalog/categories/${src.data.id}?reassignTo=${dest.data.id}`,
      );
      expect(res.status).toBe(200);

      const { rows: catRows } = await client.query(
        'SELECT COUNT(*)::int AS count FROM categories WHERE id = $1',
        [src.data.id],
      );
      expect(catRows[0].count).toBe(0);

      const { rows: prodRows } = await client.query(
        'SELECT "categoryId" FROM products WHERE slug = ANY($1)',
        [[live.data.slug, gone.data.slug]],
      );
      expect(prodRows).toHaveLength(2);
      for (const row of prodRows) {
        expect(row.categoryId).toBe(dest.data.id);
      }
    });

    it('404s a delete whose reassign target does not exist', async () => {
      const src = await createCategory({ name: `Src NoTarget ${R}` });
      await createProduct({ name: `Stuck ${R}`, categoryId: src.data.id });

      const res = await del(
        `/admin/catalog/categories/${src.data.id}` +
          `?reassignTo=00000000-0000-0000-0000-000000000000`,
      );
      expect(res.status).toBe(404);
    });

    it('still refuses to delete a category with subcategories, even with reassignTo (409)', async () => {
      const parent = await createCategory({ name: `HasChild ${R}` });
      await createCategory({ name: `Child ${R}`, parentId: parent.data.id });
      const dest = await createCategory({ name: `Dest Child ${R}` });

      const res = await del(
        `/admin/catalog/categories/${parent.data.id}?reassignTo=${dest.data.id}`,
      );
      expect(res.status).toBe(409);
    });

    it('deletes an empty category', async () => {
      const cat = await createCategory({ name: `Empty ${R}` });

      const res = await del(`/admin/catalog/categories/${cat.data.id}`);
      expect(res.status).toBe(200);

      const { rows } = await client.query(
        'SELECT COUNT(*)::int AS count FROM categories WHERE id = $1',
        [cat.data.id],
      );
      expect(rows[0].count).toBe(0);
    });

    it('rejects a reparent that would create a cycle (409)', async () => {
      const a = await createCategory({ name: `Cycle A ${R}` });
      const b = await createCategory({
        name: `Cycle B ${R}`,
        parentId: a.data.id,
      });

      // Make A a child of its own descendant B.
      const viaUpdate = await put(`/admin/catalog/categories/${a.data.id}`, {
        name: a.data.name,
        parentId: b.data.id,
      });
      expect(viaUpdate.status).toBe(409);

      const viaReorder = await patch('/admin/catalog/categories/order', {
        order: [{ id: a.data.id, parentId: b.data.id, sortOrder: 0 }],
      });
      expect(viaReorder.status).toBe(409);
    });

    it('applies a valid reorder', async () => {
      const cat = await createCategory({ name: `Reorder ${R}` });

      const res = await patch('/admin/catalog/categories/order', {
        order: [{ id: cat.data.id, parentId: parentId, sortOrder: 42 }],
      });
      expect(res.status).toBe(200);
      const mine = res.data.categories.find(
        (c: { id: string }) => c.id === cat.data.id,
      );
      expect(mine.sortOrder).toBe(42);
    });
  });
});
