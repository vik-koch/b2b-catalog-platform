import { hash } from '@node-rs/argon2';
import axios from 'axios';
import { Client } from 'pg';
import { requireEnv } from '../support/env';

/**
 * The whole-catalogue listing (FR-CAT-02/03).
 *
 * The panel is one table for the whole deployment, so this is the only suite
 * that writes it: it takes the rows it finds, works on an empty panel, and puts
 * them back afterwards — another file editing it in parallel would pull the
 * rows out from under these assertions.
 */

const ADMIN_EMAIL = 'e2e-catalog-root-admin@example.com';
const MANAGER_EMAIL = 'e2e-catalog-root-manager@example.com';
const PASSWORD = 'e2e-catalog-root-password';

// Per-run suffix, so a crashed run's leftovers cannot collide with this one.
const R = Date.now().toString(36);
const BRAND = `E2E Brand ${R}`;
const COLOUR = `E2E Root Colour ${R}`;
const UNTOUCHED = `E2E Untouched ${R}`;
const TOOLS = `e2e-root-tools-${R}`;
const GARDEN = `e2e-root-garden-${R}`;
const HIDDEN = `e2e-root-hidden-${R}`;

type Facet = { slug: string; name: string; values: { value: string }[] };

async function loginAs(email: string): Promise<string> {
  const res = await axios.post('/auth/login', { email, password: PASSWORD });
  const cookie = (res.headers['set-cookie'] as string[] | undefined)
    ?.find((c) => c.startsWith('session='))
    ?.split(';')[0];
  if (!cookie) throw new Error(`login failed for ${email}`);
  return cookie;
}

describe('Whole-catalogue listing (FR-CAT-02, FR-ATTR-12)', () => {
  let client: Client;
  let adminCookie = '';
  let managerCookie = '';
  const definitionIds: string[] = [];
  const categoryIds: string[] = [];
  let brandId = '';
  let colourId = '';
  let untouchedId = '';
  let brandSlug = '';
  let original: { attributeId: string; sortOrder: number; hidden: boolean }[] =
    [];

  const request = (
    method: 'get' | 'put',
    url: string,
    body?: unknown,
    cookie = adminCookie,
  ) =>
    axios.request({
      method,
      url,
      data: body,
      headers: cookie ? { Cookie: cookie } : {},
      validateStatus: () => true,
    });

  const listing = (query = '') =>
    request('get', `/catalog/products${query}`, undefined, '').then((res) => ({
      status: res.status,
      total: res.data.pagination.total as number,
      slugs: res.data.items.map((i: { slug: string }) => i.slug) as string[],
      facets: res.data.facets as Facet[],
      categories: res.data.categories.map(
        (c: { slug: string }) => c.slug,
      ) as string[],
    }));

  async function define(name: string) {
    const { rows } = await client.query<{ id: string; slug: string }>(
      `INSERT INTO attribute_definitions (name, slug, type)
       VALUES ($1, $2, 'text') RETURNING id, slug`,
      [name, name.toLowerCase().replace(/[^a-z0-9]+/g, '-')],
    );
    definitionIds.push(rows[0].id);
    return rows[0];
  }

  async function addCategory(slug: string) {
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO categories ("sourceId", slug, name)
       VALUES ($1, $1, $1) RETURNING id`,
      [slug],
    );
    categoryIds.push(rows[0].id);
    return rows[0].id;
  }

  async function addProduct(
    slug: string,
    categoryId: string,
    attributes: Record<string, string>,
    published = true,
  ) {
    const { rows } = await client.query<{ id: string }>(
      `WITH p AS (
         INSERT INTO products ("sourceId", slug, name, "categoryId", "publishedAt")
         VALUES ($1, $1, $1, $2, $3) RETURNING id
       ), priced AS (
         INSERT INTO product_prices ("productId", "tierId", "priceMinor")
         SELECT p.id, t.id, 100 FROM p, customer_tiers t WHERE t."isDefault"
       )
       SELECT id FROM p`,
      [slug, categoryId, published ? new Date() : null],
    );
    for (const [i, [key, value]] of Object.entries(attributes).entries()) {
      await client.query(
        `INSERT INTO product_attributes ("productId", "sortOrder", key, value)
         VALUES ($1, $2, $3, $4)`,
        [rows[0].id, i, key, value],
      );
    }
  }

  beforeAll(async () => {
    client = new Client({ connectionString: requireEnv('DATABASE_URL') });
    await client.connect();

    const passwordHash = await hash(PASSWORD);
    for (const [email, role] of [
      [ADMIN_EMAIL, 'admin'],
      [MANAGER_EMAIL, 'manager'],
    ]) {
      await client.query(
        `INSERT INTO users (email, "passwordHash", role, status)
         VALUES ($1, $2, $3, 'active')`,
        [email, passwordHash, role],
      );
    }
    adminCookie = await loginAs(ADMIN_EMAIL);
    managerCookie = await loginAs(MANAGER_EMAIL);

    ({ rows: original } = await client.query(
      'SELECT "attributeId", "sortOrder", hidden FROM catalog_attributes',
    ));
    await client.query('DELETE FROM catalog_attributes');

    const brand = await define(BRAND);
    brandId = brand.id;
    brandSlug = brand.slug;
    colourId = (await define(COLOUR)).id;
    untouchedId = (await define(UNTOUCHED)).id;

    // One brand across two categories — the case the panel exists for.
    const tools = await addCategory(TOOLS);
    const garden = await addCategory(GARDEN);
    const hidden = await addCategory(HIDDEN);
    await addProduct(`${TOOLS}-acme`, tools, {
      [BRAND]: 'Acme',
      [COLOUR]: 'Red',
    });
    await addProduct(`${TOOLS}-other`, tools, {
      [BRAND]: 'Other',
      [COLOUR]: 'Blue',
    });
    await addProduct(`${GARDEN}-acme`, garden, {
      [BRAND]: 'Acme',
      [COLOUR]: 'Green',
    });
    await addProduct(`${HIDDEN}-acme`, hidden, { [BRAND]: 'Acme' }, false);
  });

  afterAll(async () => {
    await client.query('DELETE FROM catalog_attributes');
    for (const row of original) {
      await client.query(
        `INSERT INTO catalog_attributes ("attributeId", "sortOrder", hidden)
         VALUES ($1, $2, $3)`,
        [row.attributeId, row.sortOrder, row.hidden],
      );
    }
    await client.query('DELETE FROM attribute_definitions WHERE id = ANY($1)', [
      definitionIds,
    ]);
    // product_attributes and prices cascade with their product.
    await client.query('DELETE FROM products WHERE "categoryId" = ANY($1)', [
      categoryIds,
    ]);
    await client.query('DELETE FROM categories WHERE id = ANY($1)', [
      categoryIds,
    ]);
    await client.query('DELETE FROM users WHERE email = ANY($1)', [
      [ADMIN_EMAIL, MANAGER_EMAIL],
    ]);
    await client.end();
  });

  describe('the listing', () => {
    it('ignores a filter the panel does not offer, as a category does', async () => {
      const filtered = await listing(
        `?attr=${encodeURIComponent(`${brandSlug}:Acme`)}`,
      );
      expect(filtered.status).toBe(200);
      // Two products carry the brand; the seeded catalogue is still there.
      expect(filtered.total).toBeGreaterThan(2);
    });

    it('offers the top-level categories with something visible in them', async () => {
      const { categories } = await listing();
      expect(categories).toContain(TOOLS);
      expect(categories).toContain(GARDEN);
      expect(categories).not.toContain(HIDDEN);
    });

    it('offers no filter until one is ticked', async () => {
      expect((await listing()).facets).toEqual([]);
    });
  });

  describe('the panel', () => {
    afterEach(async () => {
      await client.query('DELETE FROM catalog_attributes');
    });

    it('lists every definition unticked until something is saved', async () => {
      const res = await request('get', '/admin/catalog/filters');
      expect(res.status).toBe(200);
      const ours = res.data.filters.filter((f: { attributeId: string }) =>
        definitionIds.includes(f.attributeId),
      );
      expect(ours).toHaveLength(3);
      for (const filter of ours) {
        expect(filter.visible).toBe(false);
        expect(filter.isNew).toBe(false);
      }
    });

    it('saves an order and a hidden row, and the listing offers what is ticked', async () => {
      const saved = await request('put', '/admin/catalog/filters', {
        filters: [
          { attributeId: brandId, visible: true },
          { attributeId: colourId, visible: false },
        ],
      });
      expect(saved.status).toBe(200);
      const [first, second] = saved.data.filters;
      expect(first).toMatchObject({ attributeId: brandId, visible: true });
      expect(second).toMatchObject({ attributeId: colourId, visible: false });
      const untouched = saved.data.filters.find(
        (f: { attributeId: string }) => f.attributeId === untouchedId,
      );
      expect(untouched).toMatchObject({ visible: false, isNew: false });

      const { facets, slugs } = await listing(
        `?attr=${encodeURIComponent(`${brandSlug}:Acme`)}`,
      );
      expect(facets.map((f) => f.name)).toEqual([BRAND]);
      // Across categories, and never the unpublished one.
      expect([...slugs].sort()).toEqual([`${GARDEN}-acme`, `${TOOLS}-acme`]);
    });

    it('is not inherited: a category keeps the registry', async () => {
      await request('put', '/admin/catalog/filters', {
        filters: [{ attributeId: brandId, visible: true }],
      });
      const res = await request(
        'get',
        `/catalog/categories/${TOOLS}/products`,
        undefined,
        '',
      );
      const names = res.data.facets.map((f: Facet) => f.name);
      expect(names).toContain(BRAND);
      expect(names).toContain(COLOUR);
    });

    it('refuses an attribute nobody has', async () => {
      const res = await request('put', '/admin/catalog/filters', {
        filters: [
          {
            attributeId: '00000000-0000-0000-0000-000000000000',
            visible: true,
          },
        ],
      });
      expect(res.status).toBe(404);
      expect(res.data.code).toBe('attribute-not-found');
    });

    it('is admin-only (NFR-SEC-04)', async () => {
      expect(
        (await request('get', '/admin/catalog/filters', undefined, '')).status,
      ).toBe(401);
      expect(
        (
          await request(
            'put',
            '/admin/catalog/filters',
            { filters: [] },
            managerCookie,
          )
        ).status,
      ).toBe(403);
    });
  });
});
