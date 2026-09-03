import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { CatalogController } from './catalog.controller';
import { CatalogService } from './catalog.service';
import { ThrottlerGuard } from '@nestjs/throttler';
import { OptionalAuthGuard } from '../auth/optional-auth.guard';

/**
 * Over a real server, for the three things that only exist there: how the
 * filter panel's repeated query parameter arrives, whether the caching headers
 * a tier-priced route depends on are still applied, and what the output schema
 * lets out.
 */
describe('CatalogController', () => {
  let app: INestApplication;
  let baseUrl: string;
  let signedInTier: string | null = null;

  const getCategoryProducts = vi.fn();
  const searchProducts = vi.fn();
  const getProduct = vi.fn();

  const listing = {
    category: {
      slug: 'coffee',
      name: 'Coffee',
      shortName: null,
      ancestors: [],
      subcategories: [],
    },
    items: [],
    pagination: { page: 1, pageSize: 24, total: 0, totalPages: 0 },
    facets: [],
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [CatalogController],
      providers: [
        {
          provide: CatalogService,
          useValue: {
            getCategoryProducts,
            searchProducts,
            getProduct,
            getCategoryTree: async () => [],
            getSearchSuggestions: async () => [],
            getSitemap: async () => ({
              categories: [],
              products: [],
              pages: [],
            }),
          },
        },
      ],
    })
      // The rate limits have their own spec; here they only have to let a
      // request past.
      .overrideGuard(ThrottlerGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(OptionalAuthGuard)
      .useValue({
        canActivate: (context: {
          switchToHttp(): { getRequest(): { user?: unknown } };
        }) => {
          if (signedInTier) {
            const request = context.switchToHttp().getRequest() as {
              user?: unknown;
              pricingTierId?: string;
            };
            request.user = { id: 'user-1', role: 'user' };
            request.pricingTierId = signedInTier;
          }
          return true;
        },
      })
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.listen(0);
    baseUrl = await app.getUrl();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    signedInTier = null;
    getCategoryProducts.mockReset().mockResolvedValue(listing);
    searchProducts.mockReset();
    getProduct.mockReset();
  });

  /** What the filter panel selected, as the service was told it: one entry per
   * attribute, with the values chosen under it. */
  const selectedAttributes = () => getCategoryProducts.mock.calls[0][4];

  // A query string has no array type, and a bookmarked or hand-written link
  // may spell one any of these ways. One checkbox is the case that differs.
  const BLUE = { slug: 'colour', values: ['Blue'] };
  const LONG = { slug: 'length', values: ['30'] };

  it.each([
    ['one value', 'attr=colour%3ABlue', [BLUE]],
    [
      'the indexed form the client writes',
      'attr%5B0%5D=colour%3ABlue&attr%5B1%5D=length%3A30',
      [BLUE, LONG],
    ],
    [
      'the empty-bracket form',
      'attr%5B%5D=colour%3ABlue&attr%5B%5D=length%3A30',
      [BLUE, LONG],
    ],
    [
      'a plainly repeated parameter',
      'attr=colour%3ABlue&attr=length%3A30',
      [BLUE, LONG],
    ],
  ])('reads %s as a selection', async (_label, query, expected) => {
    const response = await fetch(
      `${baseUrl}/api/catalog/categories/coffee/products?${query}`,
    );

    expect(response.status).toBe(200);
    expect(selectedAttributes()).toEqual(expected);
  });

  // The panel can tick more boxes than a query string is usually asked to
  // carry — and every layer between here and the browser has to keep them.
  it('reads a selection longer than any one page of facets', async () => {
    const query = Array.from(
      { length: 25 },
      (_, i) => `attr%5B${i}%5D=length%3A${i}`,
    ).join('&');

    await fetch(`${baseUrl}/api/catalog/categories/coffee/products?${query}`);

    expect(selectedAttributes()).toEqual([
      { slug: 'length', values: Array.from({ length: 25 }, (_, i) => `${i}`) },
    ]);
  });

  it('defaults the page and sort the listing needs', async () => {
    await fetch(`${baseUrl}/api/catalog/categories/coffee/products`);

    const [slug, page, sort] = getCategoryProducts.mock.calls[0];
    expect([slug, page, sort]).toEqual(['coffee', 1, 'name']);
    expect(selectedAttributes()).toEqual([]);
  });

  // A shared cache that ignored this would serve one customer's prices to
  // another. It is applied by an interceptor, which the contract layer has to
  // leave in place.
  it('tells caches a listing depends on the caller', async () => {
    const response = await fetch(
      `${baseUrl}/api/catalog/categories/coffee/products`,
    );

    expect(response.headers.get('vary')).toContain('Cookie');
    // A guest variant stays cacheable, or every visitor pays a second fetch.
    expect(response.headers.get('cache-control')).toBeNull();
  });

  it('keeps a signed-in visitor’s prices out of any cache', async () => {
    signedInTier = 'tier-wholesale';

    const response = await fetch(
      `${baseUrl}/api/catalog/categories/coffee/products`,
    );

    expect(response.headers.get('vary')).toContain('Cookie');
    expect(response.headers.get('cache-control')).toBe('private, no-store');
  });

  it('prices the listing for the tier the session resolved', async () => {
    signedInTier = 'tier-wholesale';

    await fetch(`${baseUrl}/api/catalog/categories/coffee/products`);

    expect(getCategoryProducts.mock.calls[0][3]).toBe('tier-wholesale');
  });

  it('answers a declared 404 for a category nothing answers to', async () => {
    getCategoryProducts.mockResolvedValue(null);

    const response = await fetch(
      `${baseUrl}/api/catalog/categories/nope/products`,
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ code: 'not-found' });
  });

  // The private sync key is the one column that must never reach a visitor.
  it('never lets a product’s internal columns out', async () => {
    getProduct.mockResolvedValue({
      slug: 'hafen-espresso',
      name: 'Hafen Espresso',
      description: null,
      images: [],
      categorySlug: 'coffee',
      categoryName: 'Coffee',
      ancestors: [],
      attributes: [],
      price: null,
      units: [],
      lineNoteEnabled: false,
      sourceId: 'ERP-1',
      id: 'product-1',
    });

    const body = await (
      await fetch(`${baseUrl}/api/catalog/products/hafen-espresso`)
    ).json();

    expect(body).not.toHaveProperty('sourceId');
    expect(body).not.toHaveProperty('id');
  });
});
