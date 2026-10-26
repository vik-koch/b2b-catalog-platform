import axios from 'axios';
import { Client } from 'pg';
import { requireEnv } from '../support/env';

/**
 * The storefront's attribute filter (FR-ATTR-04…07).
 *
 * Against the real database, because what is under test is exactly what a
 * stubbed driver cannot show: that the counts obey the publication gate and the
 * soft delete, that selecting one attribute does not collapse its own list, and
 * that a value with no numeric form drops out of a number attribute's filter
 * while the product page still shows it.
 */

// Per-run suffix, so a crashed run's leftovers cannot collide with this one.
const R = Date.now().toString(36);
const CATEGORY = `e2e-facets-${R}`;
const COLOR = `E2E Colour ${R}`;
const LENGTH = `E2E Length ${R}`;
const FINISH = `E2E Finish ${R}`;
const NAME_TOKEN = `Facetberry${R}`;

const get = (url: string) => axios.get(url, { validateStatus: () => true });

/** ts-rest's own query encoding for a repeated parameter. */
const withAttrs = (url: string, attrs: string[]) =>
  attrs.reduce(
    (acc, value, i) =>
      `${acc}${acc.includes('?') ? '&' : '?'}attr[${i}]=${encodeURIComponent(value)}`,
    url,
  );

const products = (url: string) =>
  get(url).then((res) => ({
    status: res.status,
    slugs: res.data.items.map((i: { slug: string }) => i.slug),
    facets: res.data.facets as {
      slug: string;
      name: string;
      type: string;
      unit: string | null;
      values: { value: string; count: number; selected: boolean }[];
    }[],
  }));

const facet = (
  facets: { slug: string; values: { value: string; count: number }[] }[],
  slug: string,
) => facets.find((f) => f.slug.startsWith(slug));

const countOf = (
  values: { value: string; count: number }[] | undefined,
  value: string,
) => values?.find((v) => v.value === value)?.count;

describe('Storefront attribute facets (FR-ATTR-04…07)', () => {
  let client: Client;
  let categoryId = '';
  const definitionIds: string[] = [];
  let colorSlug = '';
  let lengthSlug = '';

  async function addProduct(
    suffix: string,
    attributes: { key: string; value: string; part?: string }[],
    options: { published?: boolean; deleted?: boolean; parts?: string[] } = {},
  ) {
    const { published = true, deleted = false, parts = [] } = options;
    const { rows } = await client.query<{ id: string }>(
      // The price is a row in the badged list, written in the same statement:
      // a published product without one could not exist.
      `WITH p AS (
         INSERT INTO products ("sourceId", slug, name,
                               "categoryId", "publishedAt", "deletedAt", parts)
         VALUES ($1, $1, $2, $3, $4, $5, $6) RETURNING id
       ), priced AS (
         INSERT INTO product_prices ("productId", "tierId", "priceMinor")
         SELECT p.id, t.id, 100 FROM p, customer_tiers t WHERE t."isDefault"
       )
       SELECT id FROM p`,
      [
        `e2e-facet-${R}-${suffix}`,
        `${NAME_TOKEN} ${suffix}`,
        categoryId,
        published ? new Date() : null,
        deleted ? new Date() : null,
        parts,
      ],
    );
    for (const [i, attribute] of attributes.entries()) {
      // valueNumeric mirrors the parse the write path applies.
      await client.query(
        `INSERT INTO product_attributes ("productId", "sortOrder", key, value,
                                         "valueNumeric", part)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          rows[0].id,
          i,
          attribute.key,
          attribute.value,
          /^-?\d+(\.\d+)?$/.test(attribute.value) ? attribute.value : null,
          attribute.part ?? null,
        ],
      );
    }
    return `e2e-facet-${R}-${suffix}`;
  }

  async function define(name: string, type: 'text' | 'number', unit?: string) {
    const { rows } = await client.query<{ id: string; slug: string }>(
      `INSERT INTO attribute_definitions (name, slug, type, unit)
       VALUES ($1, $2, $3, $4) RETURNING id, slug`,
      [name, `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`, type, unit],
    );
    definitionIds.push(rows[0].id);
    return rows[0].slug;
  }

  beforeAll(async () => {
    client = new Client({ connectionString: requireEnv('DATABASE_URL') });
    await client.connect();

    const category = await client.query<{ id: string }>(
      `INSERT INTO categories ("sourceId", slug, name)
       VALUES ($1, $1, $1) RETURNING id`,
      [CATEGORY],
    );
    categoryId = category.rows[0].id;

    colorSlug = await define(COLOR, 'text');
    lengthSlug = await define(LENGTH, 'number', 'cm');

    await addProduct('blue-30', [
      { key: COLOR, value: 'Blue' },
      { key: LENGTH, value: '30' },
      // A key nobody declared: it is entered the same way and simply does not
      // become a facet (FR-ATTR-02).
      { key: FINISH, value: 'Matt' },
    ]);
    await addProduct('blue-40', [
      { key: COLOR, value: 'Blue' },
      { key: LENGTH, value: '40' },
    ]);
    await addProduct('red-30', [
      { key: COLOR, value: 'Red' },
      { key: LENGTH, value: '30' },
    ]);
    await addProduct('green-ca', [
      { key: COLOR, value: 'Green' },
      { key: LENGTH, value: 'ca. 30' },
      // A row saved before valueless attributes stopped being stored.
      { key: COLOR, value: '' },
    ]);
    // Neither of these may be counted or listed.
    await addProduct(
      'unpublished',
      [
        { key: COLOR, value: 'Blue' },
        { key: LENGTH, value: '30' },
      ],
      { published: false },
    );
    await addProduct('deleted', [{ key: COLOR, value: 'Blue' }], {
      deleted: true,
    });
  });

  afterAll(async () => {
    await client.query('DELETE FROM attribute_definitions WHERE id = ANY($1)', [
      definitionIds,
    ]);
    // product_attributes cascade with their product.
    await client.query('DELETE FROM products WHERE "categoryId" = $1', [
      categoryId,
    ]);
    await client.query('DELETE FROM categories WHERE id = $1', [categoryId]);
    await client.end();
  });

  const listing = (attrs: string[] = []) =>
    products(withAttrs(`/catalog/categories/${CATEGORY}/products`, attrs));

  describe('the panel (FR-ATTR-04)', () => {
    it('offers the declared attributes only, counted over what a visitor can reach', async () => {
      const { facets } = await listing();

      expect(facets.map((f) => f.name)).toEqual([COLOR, LENGTH]);
      // Blue is on four products; the unpublished and the deleted one do not
      // count.
      expect(facet(facets, colorSlug)?.values).toEqual([
        { value: 'Blue', count: 2, selected: false },
        { value: 'Green', count: 1, selected: false },
        { value: 'Red', count: 1, selected: false },
      ]);
      expect(JSON.stringify(facets)).not.toContain(FINISH);
    });

    it('orders a number attribute numerically and carries its unit', async () => {
      const { facets } = await listing();
      const length = facet(facets, lengthSlug);

      expect(length?.values.map((v) => v.value)).toEqual(['30', '40']);
      expect(countOf(length?.values, '30')).toBe(2);
      expect(facets.find((f) => f.name === LENGTH)?.unit).toBe('cm');
    });

    it('drops a value with no numeric form from a number facet, but the product still shows it', async () => {
      const { facets } = await listing();
      expect(
        facet(facets, lengthSlug)?.values.map((v) => v.value),
      ).not.toContain('ca. 30');

      // Shown with its declared unit and exactly as it was typed — and with no
      // filterSlug (FR-ATTR-08): the server only offers a link where a facet
      // would actually carry the value, which this one is not.
      const product = await get(`/catalog/products/e2e-facet-${R}-green-ca`);
      expect(product.data.attributes).toContainEqual({
        key: LENGTH,
        value: 'ca. 30',
        unit: 'cm',
        filterSlug: null,
      });
    });

    it('offers no checkbox for an attribute row with no value', async () => {
      const { facets } = await listing();

      expect(
        facet(facets, colorSlug)?.values.map((v) => v.value),
      ).not.toContain('');
    });
  });

  describe('selecting (FR-ATTR-05)', () => {
    it('matches any of one attribute’s values', async () => {
      const { slugs } = await listing([
        `${colorSlug}:Blue`,
        `${colorSlug}:Red`,
      ]);

      expect(slugs.sort()).toEqual([
        `e2e-facet-${R}-blue-30`,
        `e2e-facet-${R}-blue-40`,
        `e2e-facet-${R}-red-30`,
      ]);
    });

    it('requires every selected attribute to match', async () => {
      const { slugs } = await listing([
        `${colorSlug}:Blue`,
        `${lengthSlug}:40`,
      ]);

      expect(slugs).toEqual([`e2e-facet-${R}-blue-40`]);
    });

    it('counts an attribute against the others, not against itself', async () => {
      const { facets } = await listing([`${colorSlug}:Blue`]);

      // Colour keeps its full list and its full counts: picking Blue must not
      // make Red look impossible.
      expect(facet(facets, colorSlug)?.values).toEqual([
        { value: 'Blue', count: 2, selected: true },
        { value: 'Green', count: 1, selected: false },
        { value: 'Red', count: 1, selected: false },
      ]);
      // Length is counted with Blue applied.
      expect(countOf(facet(facets, lengthSlug)?.values, '30')).toBe(1);
    });

    it('greys a value that would leave nothing, rather than hiding it', async () => {
      const { facets } = await listing([`${lengthSlug}:30`]);

      expect(facet(facets, colorSlug)?.values).toContainEqual({
        value: 'Green',
        count: 0,
        selected: false,
      });
    });

    it('accepts a single selection as a bare parameter', async () => {
      const res = await products(
        `/catalog/categories/${CATEGORY}/products?attr=${encodeURIComponent(
          `${colorSlug}:Red`,
        )}`,
      );

      expect(res.slugs).toEqual([`e2e-facet-${R}-red-30`]);
    });

    it('ignores a selection nobody declares, so an outdated link still lists', async () => {
      const { slugs } = await listing([`no-such-attribute-${R}:Blue`]);

      expect(slugs).toHaveLength(4);
    });

    it('ignores a number attribute value that is not a number', async () => {
      const { slugs } = await listing([`${lengthSlug}:ca. 30`]);

      expect(slugs).toHaveLength(4);
    });
  });

  describe('search results carry the same panel', () => {
    const search = (attrs: string[] = []) =>
      products(withAttrs(`/catalog/search?q=${NAME_TOKEN}`, attrs));

    it('filters the result set and counts within it', async () => {
      const { slugs, facets } = await search([`${colorSlug}:Red`]);

      expect(slugs).toEqual([`e2e-facet-${R}-red-30`]);
      expect(countOf(facet(facets, colorSlug)?.values, 'Red')).toBe(1);
      // Counted against the other facets only, so Blue keeps its own count.
      expect(countOf(facet(facets, colorSlug)?.values, 'Blue')).toBe(2);
    });
  });

  describe('a product sold as a set (FR-CAT-10)', () => {
    let setSlug = '';

    // Its own product, added and removed here, so the counts the panel tests
    // above pin stay as they are.
    beforeAll(async () => {
      setSlug = await addProduct(
        'set',
        [
          { key: COLOR, part: 'cup', value: 'Black' },
          { key: COLOR, part: 'lid', value: 'White' },
        ],
        { parts: ['cup', 'lid'] },
      );
    });

    afterAll(async () => {
      await client.query('DELETE FROM products WHERE slug = $1', [setSlug]);
    });

    it('is found under either part’s colour, and counted once in each', async () => {
      const { facets } = await listing();
      expect(countOf(facet(facets, colorSlug)?.values, 'Black')).toBe(1);
      expect(countOf(facet(facets, colorSlug)?.values, 'White')).toBe(1);

      expect((await listing([`${colorSlug}:White`])).slugs).toEqual([setSlug]);
      // One product for two rows of one attribute: both selections together
      // still list it once.
      expect(
        (await listing([`${colorSlug}:Black`, `${colorSlug}:White`])).slugs,
      ).toEqual([setSlug]);
    });

    it('shows each row with its part, and links it to the plain attribute', async () => {
      const product = await get(`/catalog/products/${setSlug}`);

      expect(product.data.parts).toEqual(['cup', 'lid']);
      expect(product.data.attributes).toEqual([
        {
          key: `${COLOR} (cup)`,
          value: 'Black',
          unit: null,
          filterSlug: colorSlug,
        },
        {
          key: `${COLOR} (lid)`,
          value: 'White',
          unit: null,
          filterSlug: colorSlug,
        },
      ]);
    });

    it('carries its parts on the tile', async () => {
      const res = await get(`/catalog/categories/${CATEGORY}/products`);
      const tile = res.data.items.find(
        (item: { slug: string }) => item.slug === setSlug,
      );
      expect(tile.parts).toEqual(['cup', 'lid']);
    });
  });
});
