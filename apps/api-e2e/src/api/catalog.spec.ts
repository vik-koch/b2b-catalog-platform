import { categorySeeds, productSeeds } from '@b2b-catalog-platform/seed';
import { CATALOG_PAGE_SIZE } from '@b2b-catalog-platform/shared';
import axios from 'axios';

const get = (url: string) => axios.get(url, { validateStatus: () => true });

const topLevel = categorySeeds.filter((c) => c.parentKey === null);
const coffeeChildren = categorySeeds
  .filter((c) => c.parentKey === 'coffee-beans')
  .map((c) => c.slug);
const inEspresso = productSeeds.filter((p) => p.categoryKey === 'espresso');
const underCoffeeBeans = productSeeds.filter((p) =>
  ['coffee-beans', ...coffeeChildren].includes(p.categoryKey),
);

describe('GET /catalog/categories (FR-CAT-01/02)', () => {
  it('returns the full tree with subcategories nested under their parent', async () => {
    const res = await get('/catalog/categories');

    expect(res.status).toBe(200);
    expect(res.data.categories).toHaveLength(topLevel.length);

    const coffee = res.data.categories.find(
      (c: { slug: string }) => c.slug === 'coffee-beans',
    );
    expect(coffee.children.map((c: { slug: string }) => c.slug)).toEqual(
      coffeeChildren,
    );
    // Exactly the contract keys — no internal columns (id, sourceId) leak.
    expect(Object.keys(coffee).sort()).toEqual([
      'children',
      'image',
      'name',
      'shortName',
      'slug',
    ]);
  });
});

describe('GET /catalog/categories/:slug/products (FR-CAT-03/04)', () => {
  it('paginates a deep category and never leaks internal fields', async () => {
    const res = await get('/catalog/categories/espresso/products');

    expect(res.status).toBe(200);
    expect(res.data.pagination).toEqual({
      page: 1,
      pageSize: CATALOG_PAGE_SIZE,
      total: inEspresso.length,
      totalPages: Math.ceil(inEspresso.length / CATALOG_PAGE_SIZE),
    });
    expect(res.data.items).toHaveLength(CATALOG_PAGE_SIZE);

    const item = res.data.items[0];
    expect(Object.keys(item).sort()).toEqual([
      'images',
      'name',
      'priceMinor',
      'slug',
    ]);
    // Some seed products ship without photos (the no-image placeholder case), so
    // assert the image shape against one that has images rather than items[0].
    const withImage = res.data.items.find(
      (i: { images: unknown[] }) => i.images.length > 0,
    );
    expect(Object.keys(withImage.images[0]).sort()).toEqual(['full', 'thumb']);

    // A leaf: ancestors up to the root, no subcategories. The nickname is an
    // admin overlay, so assert that a crumb carries the field, not its value.
    expect(Object.keys(res.data.category.ancestors[0]).sort()).toEqual([
      'name',
      'shortName',
      'slug',
    ]);
    expect(res.data.category.ancestors).toEqual([
      expect.objectContaining({ slug: 'coffee-beans', name: 'Coffee Beans' }),
    ]);
    expect(res.data.category.subcategories).toEqual([]);
  });

  it('returns the remaining page', async () => {
    const res = await get('/catalog/categories/espresso/products?page=2');

    expect(res.data.pagination.page).toBe(2);
    expect(res.data.items).toHaveLength(inEspresso.length - CATALOG_PAGE_SIZE);
  });

  it('includes products from descendant categories on a parent (Pattern A)', async () => {
    const res = await get('/catalog/categories/coffee-beans/products');

    expect(res.data.pagination.total).toBe(underCoffeeBeans.length);
    expect(
      res.data.category.subcategories.map((c: { slug: string }) => c.slug),
    ).toEqual(coffeeChildren);
  });

  it('returns 404 for an unknown category', async () => {
    const res = await get('/catalog/categories/nope/products');

    expect(res.status).toBe(404);
    expect(res.data).toEqual({ message: 'Category not found' });
  });

  /**
   * FR-SEARCH-04 on the category listing. Name order is asserted against the
   * endpoint's own opposite direction rather than against a JS `sort()`:
   * the database orders by its collation, which does not agree with JS on the
   * accented and mixed-case seed names. Price is an integer, so it can be
   * compared directly.
   */
  describe('sort controls (FR-SEARCH-04)', () => {
    /** Both pages of the espresso category, concatenated, for one sort. */
    const allNames = async (sort?: string): Promise<string[]> => {
      const url = (page: number) =>
        `/catalog/categories/espresso/products?page=${page}` +
        (sort ? `&sort=${sort}` : '');
      const [first, second] = await Promise.all([get(url(1)), get(url(2))]);
      return [...first.data.items, ...second.data.items].map(
        (i: { name: string }) => i.name,
      );
    };
    const prices = (res: { data: { items: { priceMinor: number }[] } }) =>
      res.data.items.map((i) => i.priceMinor);

    it('defaults to name', async () => {
      expect(await allNames()).toEqual(await allNames('name'));
    });

    it('reverses the whole listing on name_desc', async () => {
      const ascending = await allNames('name');

      expect(await allNames('name_desc')).toEqual([...ascending].reverse());
    });

    it.each([
      ['price', (a: number, b: number) => a - b],
      ['price_desc', (a: number, b: number) => b - a],
    ])('orders by %s', async (sort, compare) => {
      const res = await get(
        `/catalog/categories/espresso/products?sort=${sort}`,
      );

      expect(res.status).toBe(200);
      expect(prices(res)).toEqual([...prices(res)].sort(compare));
    });

    it('rejects an unknown sort key at the contract', async () => {
      const res = await get(
        '/catalog/categories/espresso/products?sort=cheapest',
      );

      expect(res.status).toBe(400);
    });

    it('rejects relevance, which only a query can rank', async () => {
      const res = await get(
        '/catalog/categories/espresso/products?sort=relevance',
      );

      expect(res.status).toBe(400);
    });

    it('keeps a product on exactly one page across a sorted pagination', async () => {
      const [first, second] = await Promise.all([
        get('/catalog/categories/espresso/products?sort=price'),
        get('/catalog/categories/espresso/products?sort=price&page=2'),
      ]);

      const slugs = [...first.data.items, ...second.data.items].map(
        (i: { slug: string }) => i.slug,
      );
      expect(new Set(slugs).size).toBe(slugs.length);
    });
  });
});

describe('GET /catalog/products/:slug (FR-CAT-05)', () => {
  it('returns a product in exactly the contract shape', async () => {
    const seed = inEspresso[0];
    const res = await get(`/catalog/products/${seed.slug}`);

    expect(res.status).toBe(200);
    expect(Object.keys(res.data).sort()).toEqual([
      'attributes',
      'category',
      'descriptionHtml',
      'images',
      'name',
      'priceMinor',
      'slug',
    ]);
    expect(res.data.name).toBe(seed.name);
    expect(res.data.priceMinor).toBe(seed.priceMinor);
    expect(Object.keys(res.data.category).sort()).toEqual([
      'ancestors',
      'name',
      'shortName',
      'slug',
    ]);
    expect(res.data.category).toEqual(
      expect.objectContaining({
        slug: 'espresso',
        name: 'Espresso Roasts',
        // The breadcrumb walks the whole path, not just the leaf.
        ancestors: [
          expect.objectContaining({
            slug: 'coffee-beans',
            name: 'Coffee Beans',
          }),
        ],
      }),
    );
    expect(res.data.attributes).toEqual(seed.attributes);
    // The private sync key must never be serialized.
    expect(res.data).not.toHaveProperty('sourceId');
  });

  it('returns 404 for an unknown product', async () => {
    const res = await get('/catalog/products/nope');

    expect(res.status).toBe(404);
    expect(res.data).toEqual({ message: 'Product not found' });
  });
});
