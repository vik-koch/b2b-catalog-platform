import { provideRouter } from '@angular/router';
import { TestBed } from '@angular/core/testing';
import { ComponentFixture } from '@angular/core/testing';
import { DEPLOYMENT_CONFIG } from '../config/deployment-config';
import { DeploymentConfig } from '../config/deployment-config.type';
import { APP_TEXT } from '../config/app-text';
import { defaultAppText } from '../config/app-text.fixture';
import { CategoryGrid } from './category-grid';
import { CatalogService } from './catalog.service';

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
      ancestors: [],
      subcategories: [],
    },
    items: [
      {
        slug: 'hafen-espresso',
        name: 'Hafen Espresso',
        priceMinor: 1890,
        images: [image(1)],
      },
    ],
    pagination: { page: 1, pageSize: 24, total: 1, totalPages: 1 },
    ...overrides,
  };
}

async function render(
  result: Products | null,
): Promise<ComponentFixture<CategoryGrid>> {
  const config = {
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
        useValue: { getCategoryProducts: async () => result },
      },
    ],
  });
  const fixture = TestBed.createComponent(CategoryGrid);
  fixture.componentRef.setInput('slug', 'coffee-beans');
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
          ancestors: [{ slug: 'coffee-beans', name: 'Coffee Beans' }],
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

  it('collapses subcategories to four and reveals the rest on show-more', async () => {
    const subcategories = ['a', 'b', 'c', 'd', 'e', 'f'].map((s) => ({
      slug: s,
      name: s.toUpperCase(),
      image: null,
    }));
    const f = await render(
      response({
        category: {
          slug: 'coffee-beans',
          name: 'Coffee Beans',
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

    const button = el(f).querySelector('button');
    expect(button?.textContent).toContain(defaultAppText.catalog.showMore);
    button?.click();
    await f.whenStable();
    f.detectChanges();

    expect(chipCount()).toBe(6);
    expect(el(f).querySelector('button')?.textContent).toContain(
      defaultAppText.catalog.showLess,
    );
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

  it('shows a not-found message when the category does not exist', async () => {
    const f = await render(null);

    expect(el(f).textContent).toContain(defaultAppText.catalog.emptyCategories);
  });
});
