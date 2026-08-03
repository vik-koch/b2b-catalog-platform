import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../db/schema';
import { CatalogService } from './catalog.service';
import { SearchLogger } from './search.logger';

/**
 * A drizzle stand-in for the sitemap selects. Each chain ends in `.orderBy(...)`,
 * which resolves to the next queued result array — categories, then products,
 * then pages (the Promise.all order in getSitemap).
 */
function dbReturning(results: unknown[][]) {
  let i = 0;
  const chain = {
    from: () => chain,
    where: () => chain,
    orderBy: () => Promise.resolve(results[i++]),
  };
  return { select: () => chain } as unknown as NodePgDatabase<typeof schema>;
}

describe('CatalogService.getSitemap', () => {
  it('returns category and product slugs with ISO lastmod timestamps', async () => {
    const service = new CatalogService(
      dbReturning([
        [{ slug: 'coffee-beans', updatedAt: new Date('2026-01-01T00:00:00Z') }],
        [
          {
            slug: 'hafen-espresso',
            updatedAt: new Date('2026-02-02T09:30:00Z'),
          },
          { slug: 'filter-blend', updatedAt: new Date('2026-03-03T12:00:00Z') },
        ],
        [{ slug: 'about', updatedAt: new Date('2026-04-04T08:00:00Z') }],
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

  it('yields empty lists when there is no catalog content', async () => {
    const service = new CatalogService(
      dbReturning([[], [], []]),
      new SearchLogger(),
    );

    await expect(service.getSitemap()).resolves.toEqual({
      categories: [],
      products: [],
      pages: [],
    });
  });
});
