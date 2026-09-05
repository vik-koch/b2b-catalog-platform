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

const TIER_KEY = `e2e-admincat-${R}`;

const PRODUCT_KEYS = [
  'attributes',
  'availability',
  'boxCount',
  'boxVolume',
  'boxWeight',
  'categoryId',
  'deletedAt',
  'descriptionHtml',
  'documents',
  'images',
  'lineNoteEnabled',
  'lineNotePrompt',
  'lowStockThresholdPieces',
  'minPieceQty',
  'name',
  'packsPerBox',
  'pairings',
  'piecesPerPack',
  'priceBasisPieces',
  'priceMinor',
  'publishedAt',
  'slug',
  'sourceId',
  'stockPieces',
  'tierPrices',
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
  'shortName',
  'slug',
  'sortOrder',
  'sourceId',
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
  let tierId: string;
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

  /** Put a product on the storefront. A created one is unpublished until an
   * admin says otherwise (FR-ADM-06), so any test that needs it live is
   * explicit about it. */
  async function publishProduct(slug: string) {
    const res = await patch(`/admin/catalog/products/${slug}/published`, {
      published: true,
    });
    expect(res.status).toBe(200);
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
        `INSERT INTO users (email, "passwordHash", role, status)
         VALUES ($1, $2, $3, 'active')`,
        [email, passwordHash, role],
      );
    }
    adminCookie = await loginAs(ADMIN_EMAIL);

    const { rows } = await client.query(
      'SELECT id FROM categories WHERE slug = $1',
      ['cleaning'],
    );
    parentId = rows[0].id;

    await client.query('DELETE FROM customer_tiers WHERE key = $1', [TIER_KEY]);
    const { rows: tierRows } = await client.query(
      'INSERT INTO customer_tiers (key, label) VALUES ($1, $2) RETURNING id',
      [TIER_KEY, `E2E admin tier ${R}`],
    );
    tierId = tierRows[0].id;
  });

  afterAll(async () => {
    // Products first (categoryId FK is `restrict`), then categories. Tier
    // prices cascade with their product, so the tier can only go last.
    for (const slug of createdProductSlugs) {
      await client.query('DELETE FROM products WHERE slug = $1', [slug]);
    }
    await client.query('DELETE FROM customer_tiers WHERE key = $1', [TIER_KEY]);
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
      // A new product waits for an admin to publish it (FR-ADM-06).
      expect(res.data.publishedAt).toBeNull();
      expect(res.data).not.toHaveProperty('id');
    });

    it('does not store an attribute with no value', async () => {
      // The key picker adds a row per name picked; the ones left unfilled state
      // nothing, and would print a dangling label on the product page.
      const res = await createProduct({
        name: `Half-filled ${R}`,
        attributes: [
          { key: 'Roast', value: 'Dark' },
          { key: 'Origin', value: '' },
        ],
      });

      expect(res.status).toBe(201);
      expect(res.data.attributes).toEqual([{ key: 'Roast', value: 'Dark' }]);

      // And it is the stored set that comes back on the next read.
      const read = await adminGet(`/admin/catalog/products/${res.data.slug}`);
      expect(read.data.attributes).toEqual([{ key: 'Roast', value: 'Dark' }]);
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

  describe('publication (FR-ADM-06)', () => {
    it('keeps a new product off the storefront until an admin publishes it', async () => {
      const created = await createProduct({ name: `Publish ${R}` });
      const slug = created.data.slug;
      expect(created.data.publishedAt).toBeNull();

      const hidden = await axios.get(`/catalog/products/${slug}`, {
        validateStatus: () => true,
      });
      expect(hidden.status).toBe(404);

      await publishProduct(slug);
      const visible = await axios.get(`/catalog/products/${slug}`, {
        validateStatus: () => true,
      });
      expect(visible.status).toBe(200);

      const off = await patch(`/admin/catalog/products/${slug}/published`, {
        published: false,
      });
      expect(off.data.publishedAt).toBeNull();
      const gone = await axios.get(`/catalog/products/${slug}`, {
        validateStatus: () => true,
      });
      expect(gone.status).toBe(404);
    });

    it('is independent of soft deletion: restoring does not publish', async () => {
      const created = await createProduct({ name: `Unpub Restore ${R}` });
      const slug = created.data.slug;

      await del(`/admin/catalog/products/${slug}`);
      const restored = await post(
        `/admin/catalog/products/${slug}/restore`,
        {},
      );

      expect(restored.data.deletedAt).toBeNull();
      expect(restored.data.publishedAt).toBeNull();
    });

    it('keeps an unpublished product out of every storefront read', async () => {
      // The 404 above is one read of many. A product nobody has reviewed must
      // also be absent from the listing that links to it, from search, and
      // from the sitemap that invites a crawler to fetch it.
      const name = `Unreviewed Zephyrine ${R}`;
      const created = await createProduct({ name });
      const slug = created.data.slug;

      const listed = () =>
        axios
          .get('/catalog/categories/cleaning/products?pageSize=100')
          .then((r) => r.data.items.map((i: { slug: string }) => i.slug));
      const found = () =>
        axios
          .get(`/catalog/search?q=${encodeURIComponent('Zephyrine')}`)
          .then((r) => r.data.items.map((i: { slug: string }) => i.slug));
      const mapped = () =>
        axios
          .get('/catalog/sitemap')
          .then((r) => r.data.products.map((p: { slug: string }) => p.slug));

      expect(await listed()).not.toContain(slug);
      expect(await found()).not.toContain(slug);
      expect(await mapped()).not.toContain(slug);

      await publishProduct(slug);

      expect(await listed()).toContain(slug);
      expect(await found()).toContain(slug);
      expect(await mapped()).toContain(slug);
    });

    it('lists unpublished rows under their own filter', async () => {
      const created = await createProduct({ name: `Awaiting ${R}` });

      const res = await adminGet(
        `/admin/catalog/products?state=unpublished&q=${encodeURIComponent(`Awaiting ${R}`)}`,
      );

      expect(res.data.items.map((i: { slug: string }) => i.slug)).toContain(
        created.data.slug,
      );
    });
  });

  describe('soft delete / restore', () => {
    it('hides a deleted product from the storefront but keeps it for the admin, then restores it', async () => {
      const created = await createProduct({ name: `Delete ${R}` });
      const slug = created.data.slug;
      await publishProduct(slug);

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
      await publishProduct(liveSlug);

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

  /**
   * The stock column and its filter (FR-ADM-05, FR-STOCK-02). Its own category
   * so the four rows below are the whole population, and the assertions are
   * about which of them come back rather than about global counts.
   */
  describe('the stock filter (FR-ADM-05)', () => {
    let stockCategoryId: string;
    const slugs: Record<string, string> = {};

    const byStock = async (params = '') => {
      const res = await adminGet(
        `/admin/catalog/products?categoryId=${stockCategoryId}&${params}`,
      );
      expect(res.status).toBe(200);
      return (
        res.data as {
          items: {
            slug: string;
            availability: string | null;
            stockPieces: number | null;
          }[];
        }
      ).items;
    };

    beforeAll(async () => {
      const category = await createCategory({ name: `Stock ${R}` });
      stockCategoryId = category.data.id;

      // A box of 24, so twenty pieces is "few left" and five hundred is not.
      const packaging = { piecesPerPack: 6, packsPerBox: 4, minPieceQty: 6 };
      for (const [state, stockPieces] of [
        ['in', 500],
        ['low', 20],
        ['out', 0],
      ] as const) {
        const res = await createProduct({
          name: `Stock ${state} ${R}`,
          categoryId: stockCategoryId,
          stockPieces,
          ...packaging,
        });
        expect(res.data.availability).toBe(state);
        slugs[state] = res.data.slug;
      }
      const untracked = await createProduct({
        name: `Stock untracked ${R}`,
        categoryId: stockCategoryId,
        ...packaging,
      });
      slugs['untracked'] = untracked.data.slug;
    });

    it('carries the count beside the state, so the grid can show the figure', async () => {
      const rows = await byStock();

      expect(rows).toHaveLength(4);
      expect(
        rows.map((row) => [row.availability, row.stockPieces]).sort(),
      ).toEqual(
        [
          ['in', 500],
          ['low', 20],
          ['out', 0],
          [null, null],
        ].sort(),
      );
    });

    it.each(['in', 'low', 'out'] as const)(
      'narrows to %s alone',
      async (state) => {
        const rows = await byStock(`availability=${state}`);

        expect(rows.map((row) => row.slug)).toEqual([slugs[state]]);
      },
    );

    it('shows the untracked ones only when nothing is asked', async () => {
      // There is no filter that selects them: "any" is the whole list, and
      // each of the three states excludes a product nobody is counting.
      const all = await byStock();
      expect(all.map((row) => row.slug)).toContain(slugs['untracked']);

      for (const state of ['in', 'low', 'out'] as const) {
        const rows = await byStock(`availability=${state}`);
        expect(rows.map((row) => row.slug)).not.toContain(slugs['untracked']);
      }
    });

    it('refuses a state that is not one of the three', async () => {
      const res = await adminGet(`/admin/catalog/products?availability=plenty`);

      expect(res.status).toBe(400);
    });
  });

  describe('GET /admin/catalog/categories/:slug/hidden-products', () => {
    it('lists everything the storefront hides across the subtree, with its reason', async () => {
      // Deleted directly under the parent and deleted under a child — both must
      // surface (Pattern A aggregation) — plus one that is merely unpublished,
      // and a live one that must not appear at all.
      const child = await createCategory({ name: `Deleted Sub ${R}` });
      const directDeleted = await createProduct({ name: `Direct Del ${R}` });
      const childDeleted = await createProduct({
        name: `Child Del ${R}`,
        categoryId: child.data.id,
      });
      const unpublished = await createProduct({ name: `Awaiting ${R}` });
      const live = await createProduct({ name: `Still Live ${R}` });
      await publishProduct(live.data.slug);

      await del(`/admin/catalog/products/${directDeleted.data.slug}`);
      await del(`/admin/catalog/products/${childDeleted.data.slug}`);

      const res = await adminGet(
        '/admin/catalog/categories/cleaning/hidden-products',
      );
      expect(res.status).toBe(200);
      const items = res.data.items as {
        slug: string;
        deleted: boolean;
        unpublished: boolean;
      }[];
      const bySlug = new Map(items.map((i) => [i.slug, i]));

      expect(bySlug.has(directDeleted.data.slug)).toBe(true);
      expect(bySlug.has(childDeleted.data.slug)).toBe(true);
      expect(bySlug.get(unpublished.data.slug)).toMatchObject({
        deleted: false,
        unpublished: true,
      });
      // Deleted without ever being published: both reasons apply, and the
      // overlay has to say so, since restoring alone will not bring it back.
      expect(bySlug.get(directDeleted.data.slug)).toMatchObject({
        deleted: true,
        unpublished: true,
      });
      expect(bySlug.has(live.data.slug)).toBe(false);

      // The public tile shape plus the two reasons — no internal columns leak.
      expect(Object.keys(items[0]).sort()).toEqual([
        'availability',
        'deleted',
        'images',
        'lineNoteEnabled',
        'lineNotePrompt',
        'name',
        'packaging',
        'pairedCount',
        'priceMinor',
        'prices',
        'slug',
        'unpublished',
      ]);
    });

    it('404s an unknown category', async () => {
      const res = await adminGet(
        '/admin/catalog/categories/no-such-category/hidden-products',
      );
      expect(res.status).toBe(404);
    });

    it('rejects an anonymous request with 401', async () => {
      const res = await adminGet(
        '/admin/catalog/categories/cleaning/hidden-products',
        '',
      );
      expect(res.status).toBe(401);
    });
  });

  describe('tier prices (FR-AUTH-05)', () => {
    it('stores an override and returns it with the product', async () => {
      const created = await createProduct({
        priceMinor: 1000,
        tierPrices: [{ tierId, priceMinor: 700 }],
      });

      expect(created.status).toBe(201);
      expect(created.data.priceMinor).toBe(1000);
      expect(created.data.tierPrices).toEqual([{ tierId, priceMinor: 700 }]);

      // Read back, so this proves storage rather than an echo of the request.
      const fetched = await adminGet(
        `/admin/catalog/products/${created.data.slug}`,
      );
      expect(fetched.data.tierPrices).toEqual([{ tierId, priceMinor: 700 }]);
    });

    it('a product with no overrides carries an empty list, not a null', async () => {
      const created = await createProduct({ priceMinor: 1000 });
      expect(created.data.tierPrices).toEqual([]);
    });

    it('replaces the whole set — an omitted tier loses its override', async () => {
      const created = await createProduct({
        priceMinor: 1000,
        tierPrices: [{ tierId, priceMinor: 700 }],
      });

      const updated = await put(
        `/admin/catalog/products/${created.data.slug}`,
        {
          name: created.data.name,
          priceMinor: 1000,
          categoryId: parentId,
          tierPrices: [],
        },
      );

      expect(updated.status).toBe(200);
      expect(updated.data.tierPrices).toEqual([]);
      // Scoped to this product: the other tests in this block price the same
      // tier on products of their own.
      const { rows } = await client.query(
        `SELECT count(*)::int AS n FROM product_prices pp
           JOIN products p ON p.id = pp."productId"
          WHERE pp."tierId" = $1 AND p.slug = $2`,
        [tierId, created.data.slug],
      );
      // Removed, not merely hidden: the row is gone, so the tier is back on the
      // base price.
      expect(rows[0].n).toBe(0);
    });

    it('changes an existing override in place', async () => {
      const created = await createProduct({
        priceMinor: 1000,
        tierPrices: [{ tierId, priceMinor: 700 }],
      });

      const updated = await put(
        `/admin/catalog/products/${created.data.slug}`,
        {
          name: created.data.name,
          priceMinor: 1000,
          categoryId: parentId,
          tierPrices: [{ tierId, priceMinor: 650 }],
        },
      );

      expect(updated.data.tierPrices).toEqual([{ tierId, priceMinor: 650 }]);
    });

    it('404s an unknown tier instead of failing on the foreign key', async () => {
      const res = await createProduct({
        priceMinor: 1000,
        tierPrices: [
          { tierId: '00000000-0000-4000-8000-000000000000', priceMinor: 1 },
        ],
      });

      expect(res.status).toBe(404);
    });

    it('rejects pricing the same tier twice', async () => {
      const res = await createProduct({
        priceMinor: 1000,
        tierPrices: [
          { tierId, priceMinor: 1 },
          { tierId, priceMinor: 2 },
        ],
      });

      expect(res.status).toBe(400);
    });

    it('keeps a hidden product\u2019s override on the books', async () => {
      const created = await createProduct({
        priceMinor: 1000,
        tierPrices: [{ tierId, priceMinor: 700 }],
      });
      await del(`/admin/catalog/products/${created.data.slug}`);

      // Soft delete hides a product from the storefront; it does not release
      // the tier. The count staff see says so, and the tier stays undeletable —
      // the honest answer, since the foreign key would refuse it anyway.
      const tiers = await adminGet('/admin/tiers');
      const row = tiers.data.tiers.find((t: { id: string }) => t.id === tierId);
      expect(row.priceCount).toBeGreaterThan(0);
      expect((await del(`/admin/tiers/${tierId}`)).status).toBe(409);
    });

    it('keeps the overrides through a soft delete and restore', async () => {
      const created = await createProduct({
        priceMinor: 1000,
        tierPrices: [{ tierId, priceMinor: 700 }],
      });
      const slug = created.data.slug;

      const deleted = await del(`/admin/catalog/products/${slug}`);
      expect(deleted.data.tierPrices).toEqual([{ tierId, priceMinor: 700 }]);

      const restored = await post(
        `/admin/catalog/products/${slug}/restore`,
        undefined,
      );
      expect(restored.data.tierPrices).toEqual([{ tierId, priceMinor: 700 }]);
    });
  });

  describe('line note (FR-CART-08)', () => {
    it('round-trips the flag and the prompt, and shows them on the storefront', async () => {
      const res = await createProduct({
        name: `Noted ${R}`,
        lineNoteEnabled: true,
        lineNotePrompt: 'Which colour?',
      });

      expect(res.status).toBe(201);
      expect(res.data.lineNoteEnabled).toBe(true);
      expect(res.data.lineNotePrompt).toBe('Which colour?');

      const read = await adminGet(`/admin/catalog/products/${res.data.slug}`);
      expect(read.data.lineNoteEnabled).toBe(true);
      expect(read.data.lineNotePrompt).toBe('Which colour?');

      await publishProduct(res.data.slug);
      const detail = await axios.get(`/catalog/products/${res.data.slug}`);
      expect(detail.data.lineNoteEnabled).toBe(true);
      expect(detail.data.lineNotePrompt).toBe('Which colour?');
    });

    it('defaults to off with no prompt', async () => {
      const res = await createProduct({ name: `Unnoted ${R}` });

      expect(res.data.lineNoteEnabled).toBe(false);
      expect(res.data.lineNotePrompt).toBeNull();
    });

    it('refuses a prompt without the note enabled', async () => {
      const res = await createProduct({
        name: `Prompt only ${R}`,
        lineNotePrompt: 'Which colour?',
      });

      expect(res.status).toBe(400);
    });

    it('drops the prompt when the note is turned off', async () => {
      const created = await createProduct({
        name: `Turned off ${R}`,
        lineNoteEnabled: true,
        lineNotePrompt: 'Which colour?',
      });
      const res = await put(`/admin/catalog/products/${created.data.slug}`, {
        name: `Turned off ${R}`,
        priceMinor: 1234,
        categoryId: parentId,
        lineNoteEnabled: false,
      });

      expect(res.status).toBe(200);
      expect(res.data.lineNoteEnabled).toBe(false);
      expect(res.data.lineNotePrompt).toBeNull();
    });
  });

  describe('sold-together pairings (FR-SET-01)', () => {
    /** The counterpart list as the editor reads it back, in name order. */
    const pairedSlugs = (data: { pairings: { slug: string }[] }) =>
      data.pairings.map((p) => p.slug);

    it('pairs both products from one save, and unpairs both from one save', async () => {
      const cup = await createProduct({ name: `Cup ${R}` });
      const lid = await createProduct({ name: `Lid ${R}` });

      const paired = await put(`/admin/catalog/products/${cup.data.slug}`, {
        name: `Cup ${R}`,
        priceMinor: 1234,
        categoryId: parentId,
        pairedSlugs: [lid.data.slug],
      });
      expect(paired.status).toBe(200);
      expect(pairedSlugs(paired.data)).toEqual([lid.data.slug]);

      // The other half of the edge, which nobody edited: one row, read from
      // both sides.
      const fromLid = await adminGet(
        `/admin/catalog/products/${lid.data.slug}`,
      );
      expect(pairedSlugs(fromLid.data)).toEqual([cup.data.slug]);

      const cleared = await put(`/admin/catalog/products/${cup.data.slug}`, {
        name: `Cup ${R}`,
        priceMinor: 1234,
        categoryId: parentId,
      });
      expect(pairedSlugs(cleared.data)).toEqual([]);
      const lidAfter = await adminGet(
        `/admin/catalog/products/${lid.data.slug}`,
      );
      expect(pairedSlugs(lidAfter.data)).toEqual([]);
    });

    it('pairs one product with several, and each of those back with it', async () => {
      const cup = await createProduct({ name: `Multi cup ${R}` });
      const small = await createProduct({ name: `Alid ${R}` });
      const large = await createProduct({ name: `Blid ${R}` });

      const res = await put(`/admin/catalog/products/${cup.data.slug}`, {
        name: `Multi cup ${R}`,
        priceMinor: 1234,
        categoryId: parentId,
        pairedSlugs: [large.data.slug, small.data.slug],
      });

      // Name order, whatever order they were sent in.
      expect(pairedSlugs(res.data)).toEqual([small.data.slug, large.data.slug]);
      for (const lid of [small, large]) {
        const read = await adminGet(`/admin/catalog/products/${lid.data.slug}`);
        expect(pairedSlugs(read.data)).toEqual([cup.data.slug]);
      }
    });

    it('creates a product already paired', async () => {
      const lid = await createProduct({ name: `Created-with lid ${R}` });
      const cup = await createProduct({
        name: `Created-with cup ${R}`,
        pairedSlugs: [lid.data.slug],
      });

      expect(cup.status).toBe(201);
      expect(pairedSlugs(cup.data)).toEqual([lid.data.slug]);
    });

    it('keeps the pairing when a counterpart is soft-deleted, and marks it', async () => {
      const cup = await createProduct({ name: `Kept cup ${R}` });
      const lid = await createProduct({ name: `Kept lid ${R}` });
      await put(`/admin/catalog/products/${cup.data.slug}`, {
        name: `Kept cup ${R}`,
        priceMinor: 1234,
        categoryId: parentId,
        pairedSlugs: [lid.data.slug],
      });

      await del(`/admin/catalog/products/${lid.data.slug}`);

      const read = await adminGet(`/admin/catalog/products/${cup.data.slug}`);
      expect(read.data.pairings).toEqual([
        {
          slug: lid.data.slug,
          name: `Kept lid ${R}`,
          deleted: true,
          // Nothing published either of these; both facts are reported.
          unpublished: true,
        },
      ]);
    });

    it('refuses an unknown counterpart, and a product paired with itself', async () => {
      const cup = await createProduct({ name: `Refused cup ${R}` });

      const unknown = await put(`/admin/catalog/products/${cup.data.slug}`, {
        name: `Refused cup ${R}`,
        priceMinor: 1234,
        categoryId: parentId,
        pairedSlugs: ['no-such-product'],
      });
      expect(unknown.status).toBe(404);
      expect(unknown.data.code).toBe('paired-product-not-found');

      const self = await put(`/admin/catalog/products/${cup.data.slug}`, {
        name: `Refused cup ${R}`,
        priceMinor: 1234,
        categoryId: parentId,
        pairedSlugs: [cup.data.slug],
      });
      expect(self.status).toBe(409);
      expect(self.data.code).toBe('pairing-self');
    });

    it('shows the storefront only the counterparts it can sell (FR-SET-05)', async () => {
      const cup = await createProduct({ name: `Sold cup ${R}` });
      const onSale = await createProduct({ name: `Sold lid ${R}` });
      const withheld = await createProduct({ name: `Withheld lid ${R}` });
      await publishProduct(cup.data.slug);
      await publishProduct(onSale.data.slug);

      await put(`/admin/catalog/products/${cup.data.slug}`, {
        name: `Sold cup ${R}`,
        priceMinor: 1234,
        categoryId: parentId,
        pairedSlugs: [onSale.data.slug, withheld.data.slug],
      });

      // The editor keeps saying what the admin said: both edges, one marked.
      const edited = await adminGet(`/admin/catalog/products/${cup.data.slug}`);
      expect(pairedSlugs(edited.data)).toHaveLength(2);

      // Before the save there is nothing to list — an empty list, not a 404:
      // the product exists, and it is sold with nothing.
      const lone = await createProduct({ name: `Lone ${R}` });
      await publishProduct(lone.data.slug);
      const none = await axios.get(
        `/catalog/products/${lone.data.slug}/pairings`,
        { validateStatus: () => true },
      );
      expect(none.status).toBe(200);
      expect(none.data.items).toEqual([]);

      // The storefront counts and lists only the one on offer.
      const anon = (url: string) =>
        axios.get(url, { validateStatus: () => true });
      const page = await anon(`/catalog/products/${cup.data.slug}`);
      expect(page.data.pairedCount).toBe(1);

      const pairings = await anon(
        `/catalog/products/${cup.data.slug}/pairings`,
      );
      expect(pairings.status).toBe(200);
      expect(
        pairings.data.items.map((item: { slug: string }) => item.slug),
      ).toEqual([onSale.data.slug]);
      // A tile, in the listing's own shape: the panel behind the marker is a
      // short listing, not a fourth rendering of a product.
      expect(Object.keys(pairings.data.items[0]).sort()).toEqual([
        'availability',
        'images',
        'lineNoteEnabled',
        'lineNotePrompt',
        'name',
        'packaging',
        'pairedCount',
        'priceMinor',
        'prices',
        'slug',
      ]);
      // Read from the other side too: the lid is sold with the cup.
      expect(
        (await anon(`/catalog/products/${onSale.data.slug}/pairings`)).data
          .items.length,
      ).toBe(1);

      // Withdrawing the counterpart takes the marker down without touching the
      // edge — the admin's set is unchanged, the offer is not.
      await del(`/admin/catalog/products/${onSale.data.slug}`);
      const after = await anon(`/catalog/products/${cup.data.slug}`);
      expect(after.data.pairedCount).toBe(0);
      expect(
        (await anon(`/catalog/products/${cup.data.slug}/pairings`)).data.items,
      ).toEqual([]);
      expect(
        pairedSlugs(
          (await adminGet(`/admin/catalog/products/${cup.data.slug}`)).data,
        ),
      ).toHaveLength(2);
    });

    it('refuses the same counterpart twice', async () => {
      const cup = await createProduct({ name: `Twice cup ${R}` });
      const lid = await createProduct({ name: `Twice lid ${R}` });

      const res = await put(`/admin/catalog/products/${cup.data.slug}`, {
        name: `Twice cup ${R}`,
        priceMinor: 1234,
        categoryId: parentId,
        pairedSlugs: [lid.data.slug, lid.data.slug],
      });

      expect(res.status).toBe(400);
    });
  });

  describe('stock availability (FR-STOCK-01/02/03)', () => {
    it('answers with the state the save caused, not the one before it', async () => {
      // The state is stored, so a response built from anything but the row
      // that was written would show the badge the product had a moment ago.
      const created = await createProduct({
        name: `Restocked ${R}`,
        stockPieces: 500,
      });
      expect(created.data.availability).toBe('in');

      const res = await put(`/admin/catalog/products/${created.data.slug}`, {
        name: `Restocked ${R}`,
        priceMinor: 1234,
        categoryId: parentId,
        stockPieces: 0,
      });
      expect(res.status).toBe(200);
      expect(res.data.stockPieces).toBe(0);
      expect(res.data.availability).toBe('out');
    });

    it('reads a negative figure as out of stock rather than refusing it', async () => {
      const res = await createProduct({
        name: `Corrected ${R}`,
        stockPieces: -3,
      });

      expect(res.status).toBe(201);
      expect(res.data.availability).toBe('out');
    });

    it('measures "few left" in boxes, so the same figure differs by packaging', async () => {
      const boxed = await createProduct({
        name: `Boxed ${R}`,
        stockPieces: 20,
        piecesPerPack: 6,
        packsPerBox: 4,
        minPieceQty: 6,
      });
      const loose = await createProduct({
        name: `Loose ${R}`,
        stockPieces: 20,
      });

      // A box holds 24, so twenty pieces is under one box.
      expect(boxed.data.availability).toBe('low');
      // With no box and no pack the deployment's own figure applies, and
      // twenty is comfortably above it.
      expect(loose.data.availability).toBe('in');
    });

    it('moves the line when the product overrides it', async () => {
      const res = await createProduct({
        name: `Overridden ${R}`,
        stockPieces: 20,
        lowStockThresholdPieces: 50,
      });

      expect(res.data.availability).toBe('low');
    });

    it('refuses a threshold with no stock figure behind it', async () => {
      const res = await createProduct({
        name: `Threshold only ${R}`,
        lowStockThresholdPieces: 50,
      });

      expect(res.status).toBe(400);
    });

    it('tracks nothing by default, and says so as null', async () => {
      const res = await createProduct({ name: `Untracked ${R}` });

      expect(res.data.stockPieces).toBeNull();
      expect(res.data.lowStockThresholdPieces).toBeNull();
      expect(res.data.availability).toBeNull();
    });

    it('publishes the state to the storefront and never the count', async () => {
      const created = await createProduct({
        name: `Shown ${R}`,
        stockPieces: 500,
      });
      await publishProduct(created.data.slug);

      const detail = await axios.get(`/catalog/products/${created.data.slug}`);
      expect(detail.data.availability).toBe('in');
      expect(detail.data).not.toHaveProperty('stockPieces');
      expect(detail.data).not.toHaveProperty('lowStockThresholdPieces');
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

    it('round-trips the optional short name, empty meaning none', async () => {
      const created = await createCategory({
        name: `Coffee Beans Arabica ${R}`,
        shortName: 'Arabica',
      });
      expect(created.status).toBe(201);
      expect(created.data.shortName).toBe('Arabica');

      // Cleared from the editor as an empty string → stored as null, so the
      // storefront's fallback to the full name has one representation.
      const cleared = await put(
        `/admin/catalog/categories/${created.data.id}`,
        { name: created.data.name, shortName: '' },
      );
      expect(cleared.status).toBe(200);
      expect(cleared.data.shortName).toBeNull();
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
