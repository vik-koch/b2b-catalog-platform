import {
  attributeDefinitionSeeds,
  categorySeeds,
  pairingSeeds,
  productSeeds,
} from '@b2b-catalog-platform/seed';
import {
  CATALOG_PAGE_SIZE,
  parseAttributeNumber,
} from '@b2b-catalog-platform/shared';
import axios from 'axios';

const get = (url: string) => axios.get(url, { validateStatus: () => true });

const topLevel = categorySeeds
  .filter((c) => c.parentKey === null)
  .map((c) => c.slug);
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
    // Seeded roots only, in seed order: sibling specs share this database and
    // an import creates its category unparented, so a bare count of the roots
    // is a race against whatever else is mid-run.
    const roots = res.data.categories.map((c: { slug: string }) => c.slug);
    expect(roots.filter((s: string) => topLevel.includes(s))).toEqual(topLevel);

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
    // The price basis is staff-facing and must never reach a tile (FR-UNIT-04).
    expect(JSON.stringify(item)).not.toContain('priceBasisPieces');
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
    expect(res.data).toMatchObject({ code: 'not-found' });
  });

  /**
   * FR-SEARCH-04 on the category listing. Name order is asserted against the
   * endpoint's own opposite direction rather than against a JS `sort()`:
   * the database orders by its collation, which does not agree with JS on the
   * accented and mixed-case seed names. Price is an integer, so it can be
   * compared directly.
   */
  describe('sort controls (FR-SEARCH-04)', () => {
    type Item = {
      name: string;
      priceMinor: number;
      availability: string | null;
    };

    /** Both pages of the espresso category, concatenated, for one sort. */
    const allItems = async (sort?: string): Promise<Item[]> => {
      const url = (page: number) =>
        `/catalog/categories/espresso/products?page=${page}` +
        (sort ? `&sort=${sort}` : '');
      const [first, second] = await Promise.all([get(url(1)), get(url(2))]);
      return [...first.data.items, ...second.data.items] as Item[];
    };
    const allNames = async (sort?: string): Promise<string[]> =>
      (await allItems(sort)).map((i) => i.name);

    /**
     * The listing split at the availability boundary (FR-STOCK-05): the chosen
     * sort holds *within* each half, never across the seam, so every assertion
     * about an ordering is made on one half at a time.
     */
    const halves = (items: Item[]): [Item[], Item[]] => [
      items.filter((i) => i.availability !== 'out'),
      items.filter((i) => i.availability === 'out'),
    ];
    const prices = (res: { data: { items: { priceMinor: number }[] } }) =>
      res.data.items.map((i) => i.priceMinor);

    it('defaults to name', async () => {
      expect(await allNames()).toEqual(await allNames('name'));
    });

    it('reverses each availability half on name_desc', async () => {
      // Not the whole listing: what is out of stock stays at the bottom
      // whichever way the names run (FR-STOCK-05).
      const [available, out] = halves(await allItems('name'));
      const [availableDesc, outDesc] = halves(await allItems('name_desc'));

      expect(availableDesc.map((i) => i.name)).toEqual(
        available.map((i) => i.name).reverse(),
      );
      expect(outDesc.map((i) => i.name)).toEqual(
        out.map((i) => i.name).reverse(),
      );
    });

    /**
     * FR-STOCK-05, the property the halves above rest on: an empty shelf is
     * last whatever was asked for, and it is a lead rather than a sort option
     * of its own — there is no key that undoes it.
     */
    it.each(['name', 'name_desc', 'price', 'price_desc'])(
      'leaves what is out of stock at the end on %s',
      async (sort) => {
        const items = await allItems(sort);
        const first = items.findIndex((i) => i.availability === 'out');

        // The seed has some of each; without that this asserts nothing.
        expect(first).toBeGreaterThan(0);
        expect(items.slice(first).every((i) => i.availability === 'out')).toBe(
          true,
        );
      },
    );

    it.each([
      ['price', (a: number, b: number) => a - b],
      ['price_desc', (a: number, b: number) => b - a],
    ])('orders by %s within what can be had', async (sort, compare) => {
      const res = await get(
        `/catalog/categories/espresso/products?sort=${sort}`,
      );

      expect(res.status).toBe(200);
      for (const half of halves(res.data.items as Item[])) {
        const figures = half.map((i) => i.priceMinor);
        expect(figures).toEqual([...figures].sort(compare));
      }
      // And the whole page is still priced — the split is about order alone.
      expect(prices(res).length).toBeGreaterThan(0);
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
      'availability',
      'boxDimensions',
      'category',
      'descriptionHtml',
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
    expect(res.data.name).toBe(seed.name);
    // `priceMinor` is the price of one *piece*; the seed's is the price of
    // however many pieces that product's basis covers (FR-UNIT-04).
    const basis = seed.packaging?.priceBasisPieces ?? 1;
    expect(res.data.priceMinor).toBe(Math.round(seed.priceMinor / basis));
    // The basis itself is staff-facing and never serialized.
    expect(JSON.stringify(res.data)).not.toContain('priceBasisPieces');
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
    // The stored key and value, plus what the definition the key matches adds:
    // its unit (the value never carries its own) and the slug that turns the
    // row into a filter link (FR-ATTR-01/02/08).
    expect(res.data.attributes).toEqual(
      seed.attributes.map((attribute) => {
        const definition = attributeDefinitionSeeds.find(
          (d) => d.name === attribute.key,
        );
        const filterable =
          definition &&
          (definition.type !== 'number' ||
            parseAttributeNumber(attribute.value) !== null);
        return {
          ...attribute,
          unit: definition?.unit ?? null,
          filterSlug: filterable ? definition.slug : null,
        };
      }),
    );
    // The private sync key must never be serialized.
    expect(res.data).not.toHaveProperty('sourceId');
  });

  it('returns 404 for an unknown product', async () => {
    const res = await get('/catalog/products/nope');

    expect(res.status).toBe(404);
    expect(res.data).toMatchObject({ code: 'not-found' });
  });
});
