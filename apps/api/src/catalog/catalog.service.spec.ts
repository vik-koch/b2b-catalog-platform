import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../db/schema';
import { CatalogService } from './catalog.service';
import { SearchLogger } from './search.logger';

/**
 * A drizzle stand-in for the sitemap selects. Each chain resolves to the next
 * queued result array — categories, products, pages (the Promise.all order in
 * getSitemap), then the live-category ids the pruning reads.
 */
function dbReturning(results: unknown[][]) {
  let i = 0;
  // Chainable and awaitable at once, so a query ending in `.where(...)` and one
  // ending in `.orderBy(...)` both resolve to the next queued array.
  const chain = {
    from: () => chain,
    where: () => chain,
    orderBy: () => chain,
    then: (resolve: (rows: unknown[]) => unknown) => resolve(results[i++]),
  };
  return {
    select: () => chain,
    selectDistinct: () => chain,
  } as unknown as NodePgDatabase<typeof schema>;
}

const category = (
  id: string,
  slug: string,
  parentId: string | null = null,
) => ({
  id,
  parentId,
  slug,
  updatedAt: new Date('2026-01-01T00:00:00Z'),
});

describe('CatalogService.getSitemap', () => {
  it('returns category and product slugs with ISO lastmod timestamps', async () => {
    const service = new CatalogService(
      dbReturning([
        [category('cb', 'coffee-beans')],
        [
          {
            slug: 'hafen-espresso',
            updatedAt: new Date('2026-02-02T09:30:00Z'),
          },
          { slug: 'filter-blend', updatedAt: new Date('2026-03-03T12:00:00Z') },
        ],
        [{ slug: 'about', updatedAt: new Date('2026-04-04T08:00:00Z') }],
        [{ id: 'cb' }],
      ]),
      new SearchLogger(),
    );

    const result = await service.getSitemap();

    expect(result.categories).toEqual([
      { slug: 'coffee-beans', updatedAt: '2026-01-01T00:00:00.000Z' },
    ]);
    expect(result.products.map((p) => p.slug)).toEqual([
      'hafen-espresso',
      'filter-blend',
    ]);
    expect(result.products[0].updatedAt).toBe('2026-02-02T09:30:00.000Z');
    expect(result.pages).toEqual([
      { slug: 'about', updatedAt: '2026-04-04T08:00:00.000Z' },
    ]);
  });

  it('offers a crawler only the categories with something to show', async () => {
    // `tea` holds nothing visible, so it is not a URL worth crawling; the
    // parent of a stocked leaf is, even with no products of its own.
    const service = new CatalogService(
      dbReturning([
        [
          category('cb', 'coffee-beans'),
          category('esp', 'espresso', 'cb'),
          category('tea', 'tea'),
        ],
        [],
        [],
        [{ id: 'esp' }],
      ]),
      new SearchLogger(),
    );

    const result = await service.getSitemap();

    expect(result.categories.map((c) => c.slug)).toEqual([
      'coffee-beans',
      'espresso',
    ]);
  });

  it('yields empty lists when there is no catalog content', async () => {
    const service = new CatalogService(
      dbReturning([[], [], [], []]),
      new SearchLogger(),
    );

    await expect(service.getSitemap()).resolves.toEqual({
      categories: [],
      products: [],
      pages: [],
    });
  });
});
