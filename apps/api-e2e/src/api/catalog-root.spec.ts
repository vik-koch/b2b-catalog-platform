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
const PLAIN = `e2e-root-plain-${R}`;
const SHEDS = `e2e-root-sheds-${R}`;
const BEDS = `e2e-root-beds-${R}`;

type Facet = { slug: string; name: string; values: { value: string }[] };
type Chip = { slug: string; count: number; attr: string[] };

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
      chips: res.data.categories as Chip[],
    }));

  /** Every product slug of the whole listing in its order, page by page. */
  async function allSlugs(query = ''): Promise<string[]> {
    const slugs: string[] = [];
    for (let page = 1; ; page++) {
      const res = await request(
        'get',
        `/catalog/products?page=${page}${query}`,
        undefined,
        '',
      );
      slugs.push(...res.data.items.map((i: { slug: string }) => i.slug));
      if (page >= res.data.pagination.totalPages) return slugs;
    }
  }

  async function define(name: string) {
    const { rows } = await client.query<{ id: string; slug: string }>(
      `INSERT INTO attribute_definitions (name, slug, type)
       VALUES ($1, $2, 'text') RETURNING id, slug`,
      [name, name.toLowerCase().replace(/[^a-z0-9]+/g, '-')],
    );
    definitionIds.push(rows[0].id);
    return rows[0];
  }

  async function addCategory(
    slug: string,
    sortOrder = 0,
    parentId: string | null = null,
  ) {
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO categories ("sourceId", slug, name, "sortOrder", "parentId")
       VALUES ($1, $1, $1, $2, $3) RETURNING id`,
      [slug, sortOrder, parentId],
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

    // One brand across two categories — the case the panel exists for. Tools
    // is ordered ahead of garden, against the alphabet.
    const tools = await addCategory(TOOLS, 1);
    const garden = await addCategory(GARDEN, 2);
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
    await client.query(
      `UPDATE products SET availability = 'out', "stockPieces" = 0 WHERE slug = $1`,
      [`${TOOLS}-acme`],
    );

    // Beds sits under garden; plain has no Acme; sheds has none either, but
    // its own panel does not offer the brand at all.
    const beds = await addCategory(BEDS, 0, garden);
    await addProduct(`${BEDS}-rose`, beds, { [COLOUR]: 'Red' });
    const plain = await addCategory(PLAIN);
    await addProduct(`${PLAIN}-other`, plain, { [BRAND]: 'Other' });
    const sheds = await addCategory(SHEDS);
    await addProduct(`${SHEDS}-other`, sheds, { [BRAND]: 'Other' });
    await client.query(
      `INSERT INTO category_attributes ("categoryId", "attributeId", "sortOrder")
       VALUES ($1, $2, 0)`,
      [sheds, colourId],
    );
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

    it('groups by category in tree order, stock and name within', async () => {
      const ours = (await allSlugs()).filter((slug) =>
        [TOOLS, GARDEN, BEDS].some((prefix) => slug.startsWith(prefix)),
      );
      expect(ours).toEqual([
        `${TOOLS}-other`,
        `${TOOLS}-acme`,
        `${GARDEN}-acme`,
        `${BEDS}-rose`,
      ]);

      const byName = (await allSlugs('&sort=name')).filter((slug) =>
        [TOOLS, GARDEN, BEDS].some((prefix) => slug.startsWith(prefix)),
      );
      expect(byName.indexOf(`${GARDEN}-acme`)).toBeLessThan(
        byName.indexOf(`${TOOLS}-other`),
      );
    });

    it('groups a category listing by its subcategories too', async () => {
      const slugs = async (query: string) =>
        (
          await request(
            'get',
            `/catalog/categories/${GARDEN}/products${query}`,
            undefined,
            '',
          )
        ).data.items.map((i: { slug: string }) => i.slug);

      expect(await slugs('')).toEqual([`${GARDEN}-acme`, `${BEDS}-rose`]);
      expect(await slugs('?sort=name')).toEqual([
        `${BEDS}-rose`,
        `${GARDEN}-acme`,
      ]);
    });
  });

  describe('the chips under a selection (FR-ATTR-13)', () => {
    beforeAll(async () => {
      await client.query(
        `INSERT INTO catalog_attributes ("attributeId", "sortOrder")
         VALUES ($1, 0)`,
        [brandId],
      );
    });
    afterAll(async () => {
      await client.query('DELETE FROM catalog_attributes');
    });

    const chip = (chips: Chip[], slug: string) =>
      chips.find((c) => c.slug === slug);

    it('counts each chip under what its own panel offers', async () => {
      const acme = `${brandSlug}:Acme`;
      const { chips } = await listing(`?attr=${encodeURIComponent(acme)}`);

      expect(chip(chips, TOOLS)).toMatchObject({ count: 1, attr: [acme] });
      expect(chip(chips, GARDEN)).toMatchObject({ count: 1, attr: [acme] });
      expect(chip(chips, PLAIN)).toMatchObject({ count: 0, attr: [acme] });
      // Its panel has no brand, so the brand neither travels nor counts.
      expect(chip(chips, SHEDS)).toMatchObject({ count: 1, attr: [] });
    });

    it('counts a subtree whole, with nothing selected', async () => {
      const { chips } = await listing();
      expect(chip(chips, GARDEN)).toMatchObject({ count: 2, attr: [] });
    });

    it("counts a category listing's subcategories the same way", async () => {
      const colourSlug = COLOUR.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const res = await request(
        'get',
        `/catalog/categories/${GARDEN}/products?attr=${encodeURIComponent(
          `${colourSlug}:Green`,
        )}`,
        undefined,
        '',
      );
      expect(res.data.category.subcategories).toEqual([
        expect.objectContaining({
          slug: BEDS,
          count: 0,
          attr: [`${colourSlug}:Green`],
        }),
      ]);
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
