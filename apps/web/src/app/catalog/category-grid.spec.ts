import { provideRouter } from '@angular/router';
import { TestBed } from '@angular/core/testing';
import { ComponentFixture } from '@angular/core/testing';
import { DEPLOYMENT_CONFIG } from '../config/deployment-config';
import { DeploymentConfig } from '../config/deployment-config.type';
import { APP_TEXT } from '../config/app-text';
import { defaultAppText } from '../config/app-text.fixture';
import { CategoryGrid } from './category-grid';
import { CatalogService } from './catalog.service';
import { productListItem } from './product.fixture';

type Products = NonNullable<
  Awaited<ReturnType<CatalogService['getCategoryProducts']>>
>;

const image = (n: number) => ({
  full: `https://img.example/full/${n}.jpg`,
  thumb: `https://img.example/thumb/${n}.jpg`,
});

function response(overrides: Partial<Products> = {}): Products {
  return {
    category: {
      slug: 'coffee-beans',
      name: 'Coffee Beans',
      shortName: null,
      ancestors: [],
      subcategories: [],
    },
    items: [
      productListItem({
        slug: 'hafen-espresso',
        name: 'Hafen Espresso',
        priceMinor: 1890,
        images: [image(1)],
      }),
    ],
    pagination: { page: 1, pageSize: 24, total: 1, totalPages: 1 },
    facets: [],
    ...overrides,
  };
}

interface SortOptions {
  /** The raw `sort` query parameter, as the router would bind it. */
  sort?: string;
  /** Records what the component actually asked the API to sort by. */
  spy?: (sort: string) => void;
  /** The raw `attr` query parameter, as the router would bind it. */
  attr?: string | string[];
  /** Records the selection the component actually sent on. */
  attrSpy?: (attr: string[]) => void;
}

async function render(
  result: Products | null,
  { sort, spy, attr, attrSpy }: SortOptions = {},
): Promise<ComponentFixture<CategoryGrid>> {
  const config = {
    branding: { title: 'Test Shop' },
    catalog: { currency: { code: 'EUR', locale: 'de-DE' } },
  } as unknown as DeploymentConfig;
  TestBed.configureTestingModule({
    imports: [CategoryGrid],
    providers: [
      provideRouter([]),
      { provide: APP_TEXT, useValue: defaultAppText },
      { provide: DEPLOYMENT_CONFIG, useValue: config },
      {
        provide: CatalogService,
        useValue: {
          getCategoryProducts: async (
            _slug: string,
            _page: number,
            s: string,
            a: string[],
          ) => {
            spy?.(s);
            attrSpy?.(a);
            return result;
          },
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(CategoryGrid);
  fixture.componentRef.setInput('slug', 'coffee-beans');
  if (sort !== undefined) fixture.componentRef.setInput('sort', sort);
  if (attr !== undefined) fixture.componentRef.setInput('attr', attr);
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

const el = (f: ComponentFixture<CategoryGrid>) =>
  f.nativeElement as HTMLElement;

describe('CategoryGrid', () => {
  it('renders the heading and a product tile with formatted price', async () => {
    const f = await render(response());
    const root = el(f);

    expect(root.querySelector('h1')?.textContent).toContain('Coffee Beans');
    expect(
      root.querySelector('a[href="/product/hafen-espresso"]'),
    ).not.toBeNull();
    expect(root.textContent?.replace(/\u00A0/g, ' ')).toContain('18,90 €');
  });

  it('renders a breadcrumb of ancestors', async () => {
    const f = await render(
      response({
        category: {
          slug: 'espresso',
          name: 'Espresso Roasts',
          shortName: null,
          ancestors: [
            { slug: 'coffee-beans', name: 'Coffee Beans', shortName: null },
          ],
          subcategories: [],
        },
      }),
    );
    const nav = el(f).querySelector('nav');

    expect(nav?.querySelector('a[href="/catalog"]')).not.toBeNull();
    expect(
      nav?.querySelector('a[href="/catalog/coffee-beans"]'),
    ).not.toBeNull();
  });

  it('shows short names in the breadcrumb, chips and headings', async () => {
    const f = await render(
      response({
        category: {
          slug: 'espresso',
          name: 'Espresso Roasts',
          shortName: 'Espresso',
          ancestors: [
            { slug: 'coffee-beans', name: 'Coffee Beans', shortName: 'Beans' },
          ],
          subcategories: [
            {
              slug: 'dark',
              name: 'Espresso Roasts Dark',
              shortName: 'Dark',
              image: null,
            },
            {
              slug: 'light',
              name: 'Espresso Roasts Light',
              shortName: null,
              image: null,
            },
          ],
        },
      }),
    );
    const root = el(f);

    const nav = root.querySelector('nav');
    expect(nav?.textContent).toContain('Beans');
    expect(nav?.textContent).toContain('Espresso');
    expect(nav?.textContent).not.toContain('Coffee Beans');
    // The heading keeps the full name — it stands on its own.
    expect(root.querySelector('h1')?.textContent?.trim()).toBe(
      'Espresso Roasts',
    );
    expect(
      root.querySelector('a[href="/catalog/dark"]')?.textContent?.trim(),
    ).toBe('Dark');
    // No short name set → the chip falls back to the full name.
    expect(
      root.querySelector('a[href="/catalog/light"]')?.textContent?.trim(),
    ).toBe('Espresso Roasts Light');
  });

  it('collapses subcategories to four and reveals the rest on show-more', async () => {
    const subcategories = ['a', 'b', 'c', 'd', 'e', 'f'].map((s) => ({
      slug: s,
      name: s.toUpperCase(),
      shortName: null,
      image: null,
    }));
    const f = await render(
      response({
        category: {
          slug: 'coffee-beans',
          name: 'Coffee Beans',
          shortName: null,
          ancestors: [],
          subcategories,
        },
      }),
    );

    const chipCount = () =>
      subcategories.filter((s) =>
        el(f).querySelector(`a[href="/catalog/${s.slug}"]`),
      ).length;

    expect(chipCount()).toBe(4);

    // By its words: the listing header above the chips carries buttons of its
    // own (the layout toggle), so position says nothing.
    const toggle = (label: string) =>
      [...el(f).querySelectorAll('button')].find((b) =>
        (b.textContent ?? '').includes(label),
      );

    expect(toggle(defaultAppText.catalog.showMore)).toBeTruthy();
    toggle(defaultAppText.catalog.showMore)?.click();
    await f.whenStable();
    f.detectChanges();

    expect(chipCount()).toBe(6);
    expect(toggle(defaultAppText.catalog.showLess)).toBeTruthy();
  });

  it('shows pagination with prev/next links when there is more than one page', async () => {
    const f = await render(
      response({
        pagination: { page: 2, pageSize: 24, total: 60, totalPages: 3 },
      }),
    );
    const root = el(f);

    const prev = root.querySelector('a[href="/catalog/coffee-beans?page=1"]');
    const next = root.querySelector('a[href="/catalog/coffee-beans?page=3"]');
    expect(prev).not.toBeNull();
    expect(next).not.toBeNull();
    expect(root.textContent).toContain('Page 2 of 3');
  });

  it('shows an empty message when the category has no products', async () => {
    const f = await render(
      response({
        items: [],
        pagination: { page: 1, pageSize: 24, total: 0, totalPages: 0 },
      }),
    );

    expect(el(f).textContent).toContain(defaultAppText.catalog.emptyProducts);
  });

  describe('sorting (FR-SEARCH-04)', () => {
    it('asks the API for the sort in the URL', async () => {
      const asked: string[] = [];
      const f = await render(response(), {
        sort: 'price',
        spy: (s) => asked.push(s),
      });

      expect(asked).toEqual(['price']);
      expect(el(f).querySelector('select')?.value).toBe('price');
    });

    it('defaults to name, and offers no relevance option without a query', async () => {
      const asked: string[] = [];
      const f = await render(response(), { spy: (s) => asked.push(s) });

      expect(asked).toEqual(['name']);
      expect(
        [...(el(f).querySelector('select')?.options ?? [])].map((o) => o.value),
      ).not.toContain('relevance');
    });

    it('falls back to the default rather than forwarding an unknown key', async () => {
      const asked: string[] = [];
      await render(response(), {
        // Relevance included: the category endpoint would reject it, so the
        // page must not pass it on just because it is a valid search sort.
        sort: 'relevance',
        spy: (s) => asked.push(s),
      });

      expect(asked).toEqual(['name']);
    });

    it('carries a non-default sort into the pagination links', async () => {
      const f = await render(
        response({
          pagination: { page: 2, pageSize: 24, total: 60, totalPages: 3 },
        }),
        { sort: 'price_desc' },
      );

      const next = [...el(f).querySelectorAll('a')].find((a) =>
        a.textContent?.includes(defaultAppText.catalog.nextPage),
      );
      expect(next?.getAttribute('href')).toContain('page=3');
      expect(next?.getAttribute('href')).toContain('sort=price_desc');
    });

    it('offers no sort control on an empty category', async () => {
      const f = await render(
        response({
          items: [],
          pagination: { page: 1, pageSize: 24, total: 0, totalPages: 0 },
        }),
      );

      expect(el(f).querySelector('select')).toBeNull();
    });
  });

  describe('attribute filters (FR-ATTR-04…07)', () => {
    const facet = {
      slug: 'grind',
      name: 'Grind',
      type: 'text' as const,
      unit: null,
      values: [{ value: 'fine', count: 1, selected: true }],
    };

    it('sends the selection on, normalized, and renders the panel', async () => {
      let sent: string[] = [];
      const f = await render(response({ facets: [facet] }), {
        attr: ['grind:fine', 'grind:fine', 'broken'],
        attrSpy: (a) => (sent = a),
      });

      expect(sent).toEqual(['grind:fine']);
      expect(el(f).textContent).toContain(defaultAppText.catalog.filters.title);
      expect(el(f).textContent).toContain('Grind');
    });

    it('carries the selection through the pagination links', async () => {
      const f = await render(
        response({
          facets: [facet],
          pagination: { page: 2, pageSize: 24, total: 60, totalPages: 3 },
        }),
        { attr: 'grind:fine' },
      );

      const next = [...el(f).querySelectorAll('a')].find((a) =>
        a.textContent?.includes(defaultAppText.catalog.nextPage),
      );
      expect(next?.getAttribute('href')).toContain('attr=grind:fine');
    });

    it('carries the selection down into a subcategory and up the breadcrumb', async () => {
      const f = await render(
        response({
          facets: [facet],
          category: {
            slug: 'espresso',
            name: 'Espresso Roasts',
            shortName: null,
            ancestors: [
              {
                slug: 'coffee-beans',
                name: 'Coffee Beans',
                shortName: null,
              },
            ],
            subcategories: [
              {
                slug: 'single-origin',
                name: 'Single Origin',
                shortName: null,
                image: null,
              },
            ],
          },
        }),
        { attr: 'grind:fine', sort: 'price_desc' },
      );

      const href = (name: string) =>
        [...el(f).querySelectorAll('a')]
          .find((a) => a.textContent?.trim() === name)
          ?.getAttribute('href');
      expect(href('Single Origin')).toContain('attr=grind:fine');
      expect(href('Coffee Beans')).toContain('attr=grind:fine');
      // The sort is the same kind of stated preference and travels with it.
      expect(href('Single Origin')).toContain('sort=price_desc');
      expect(href('Coffee Beans')).toContain('sort=price_desc');
    });

    it('keeps the panel on screen when the selection matches nothing', async () => {
      const f = await render(
        response({
          facets: [facet],
          items: [],
          pagination: { page: 1, pageSize: 24, total: 0, totalPages: 0 },
        }),
        { attr: 'grind:fine' },
      );

      const text = el(f).textContent ?? '';
      expect(text).toContain(defaultAppText.catalog.filters.noMatches);
      expect(text).not.toContain(defaultAppText.catalog.emptyProducts);
      expect(el(f).querySelector('input[type="checkbox"]')).not.toBeNull();
    });
  });

  it('shows a not-found message when the category does not exist', async () => {
    const f = await render(null);

    expect(el(f).textContent).toContain(
      defaultAppText.catalog.categoryNotFound,
    );
  });
});

describe('CategoryGrid layout', () => {
  beforeEach(() => {
    document.cookie = 'product_layout=;path=/;max-age=0';
  });

  // Cards and lines are different markup, not one set of elements styled two
  // ways, so the choice has to reach the listing itself — and the category
  // listing and the search results have to answer it the same way.
  it('draws lines instead of cards once the visitor asks for them', async () => {
    const cards = await render(response());
    expect(el(cards).querySelector('app-product-tile')).not.toBeNull();
    expect(el(cards).querySelector('app-product-row')).toBeNull();

    // As the service writes it, and as the next page load would find it.
    document.cookie = 'product_layout=list;path=/';
    TestBed.resetTestingModule();
    const lines = await render(response());

    expect(el(lines).querySelector('app-product-row')).not.toBeNull();
    expect(el(lines).querySelector('app-product-tile')).toBeNull();
  });
});
