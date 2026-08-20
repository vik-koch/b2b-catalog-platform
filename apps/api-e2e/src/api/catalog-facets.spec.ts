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
const COLOUR = `E2E Colour ${R}`;
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
  let colourSlug = '';
  let lengthSlug = '';

  async function addProduct(
    suffix: string,
    attributes: { key: string; value: string }[],
    options: { published?: boolean; deleted?: boolean } = {},
  ) {
    const { published = true, deleted = false } = options;
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO products ("sourceId", slug, name, "defaultPriceMinor",
                             "categoryId", "publishedAt", "deletedAt")
       VALUES ($1, $1, $2, 100, $3, $4, $5) RETURNING id`,
      [
        `e2e-facet-${R}-${suffix}`,
        `${NAME_TOKEN} ${suffix}`,
        categoryId,
        published ? new Date() : null,
        deleted ? new Date() : null,
      ],
    );
    for (const [i, attribute] of attributes.entries()) {
      // valueNumeric mirrors the parse the write path applies.
      await client.query(
        `INSERT INTO product_attributes ("productId", "sortOrder", key, value,
                                         "valueNumeric")
         VALUES ($1, $2, $3, $4, $5)`,
        [
          rows[0].id,
          i,
          attribute.key,
          attribute.value,
          /^-?\d+(\.\d+)?$/.test(attribute.value) ? attribute.value : null,
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

    colourSlug = await define(COLOUR, 'text');
    lengthSlug = await define(LENGTH, 'number', 'cm');

    await addProduct('blue-30', [
      { key: COLOUR, value: 'Blue' },
      { key: LENGTH, value: '30' },
      // A key nobody declared: it is entered the same way and simply does not
      // become a facet (FR-ATTR-02).
      { key: FINISH, value: 'Matt' },
    ]);
    await addProduct('blue-40', [
      { key: COLOUR, value: 'Blue' },
      { key: LENGTH, value: '40' },
    ]);
    await addProduct('red-30', [
      { key: COLOUR, value: 'Red' },
      { key: LENGTH, value: '30' },
    ]);
    await addProduct('green-ca', [
      { key: COLOUR, value: 'Green' },
      { key: LENGTH, value: 'ca. 30' },
      // A row saved before valueless attributes stopped being stored.
      { key: COLOUR, value: '' },
    ]);
    // Neither of these may be counted or listed.
    await addProduct(
      'unpublished',
      [
        { key: COLOUR, value: 'Blue' },
        { key: LENGTH, value: '30' },
      ],
      { published: false },
    );
    await addProduct('deleted', [{ key: COLOUR, value: 'Blue' }], {
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

      expect(facets.map((f) => f.name)).toEqual([COLOUR, LENGTH]);
      // Blue is on four products; the unpublished and the deleted one do not
      // count.
      expect(facet(facets, colourSlug)?.values).toEqual([
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

      const product = await get(`/catalog/products/e2e-facet-${R}-green-ca`);
      expect(product.data.attributes).toContainEqual({
        key: LENGTH,
        value: 'ca. 30',
      });
    });

    it('offers no checkbox for an attribute row with no value', async () => {
      const { facets } = await listing();

      expect(
        facet(facets, colourSlug)?.values.map((v) => v.value),
      ).not.toContain('');
    });
  });

  describe('selecting (FR-ATTR-05)', () => {
    it('matches any of one attribute’s values', async () => {
      const { slugs } = await listing([
        `${colourSlug}:Blue`,
        `${colourSlug}:Red`,
      ]);

      expect(slugs.sort()).toEqual([
        `e2e-facet-${R}-blue-30`,
        `e2e-facet-${R}-blue-40`,
        `e2e-facet-${R}-red-30`,
      ]);
    });

    it('requires every selected attribute to match', async () => {
      const { slugs } = await listing([
        `${colourSlug}:Blue`,
        `${lengthSlug}:40`,
      ]);

      expect(slugs).toEqual([`e2e-facet-${R}-blue-40`]);
    });

    it('counts an attribute against the others, not against itself', async () => {
      const { facets } = await listing([`${colourSlug}:Blue`]);

      // Colour keeps its full list and its full counts: picking Blue must not
      // make Red look impossible.
      expect(facet(facets, colourSlug)?.values).toEqual([
        { value: 'Blue', count: 2, selected: true },
        { value: 'Green', count: 1, selected: false },
        { value: 'Red', count: 1, selected: false },
      ]);
      // Length is counted with Blue applied.
      expect(countOf(facet(facets, lengthSlug)?.values, '30')).toBe(1);
    });

    it('greys a value that would leave nothing, rather than hiding it', async () => {
      const { facets } = await listing([`${lengthSlug}:30`]);

      expect(facet(facets, colourSlug)?.values).toContainEqual({
        value: 'Green',
        count: 0,
        selected: false,
      });
    });

    it('accepts a single selection as a bare parameter', async () => {
      const res = await products(
        `/catalog/categories/${CATEGORY}/products?attr=${encodeURIComponent(
          `${colourSlug}:Red`,
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
      const { slugs, facets } = await search([`${colourSlug}:Red`]);

      expect(slugs).toEqual([`e2e-facet-${R}-red-30`]);
      expect(countOf(facet(facets, colourSlug)?.values, 'Red')).toBe(1);
      // Counted against the other facets only, so Blue keeps its own count.
      expect(countOf(facet(facets, colourSlug)?.values, 'Blue')).toBe(2);
    });
  });
});
