import { provideRouter } from '@angular/router';
import { TestBed } from '@angular/core/testing';
import { CategoryNode } from '@b2b-catalog-platform/shared';
import { APP_TEXT } from '../config/app-text';
import { defaultAppText } from '../config/app-text.fixture';
import { DEPLOYMENT_CONFIG } from '../config/deployment-config';
import { DeploymentConfig } from '../config/deployment-config.type';
import { CategoryOverview } from './category-overview';
import { CatalogService } from './catalog.service';

const tree: CategoryNode[] = [
  {
    slug: 'coffee-beans',
    name: 'Coffee Beans',
    shortName: null,
    image: {
      full: 'https://img.example/full.jpg',
      thumb: 'https://img.example/thumb.jpg',
    },
    children: [
      {
        slug: 'espresso',
        name: 'Espresso Roasts',
        shortName: 'Espresso',
        image: null,
        children: [],
      },
      {
        slug: 'filter',
        name: 'Filter Roasts',
        shortName: null,
        image: null,
        children: [],
      },
    ],
  },
  { slug: 'tea', name: 'Tea', shortName: null, image: null, children: [] },
];

async function render(
  getCategoryTree: () => Promise<CategoryNode[]>,
): Promise<HTMLElement> {
  TestBed.configureTestingModule({
    imports: [CategoryOverview],
    providers: [
      provideRouter([]),
      { provide: APP_TEXT, useValue: defaultAppText },
      {
        provide: DEPLOYMENT_CONFIG,
        useValue: {
          branding: { title: 'Test Shop' },
        } as unknown as DeploymentConfig,
      },
      { provide: CatalogService, useValue: { getCategoryTree } },
    ],
  });
  const fixture = TestBed.createComponent(CategoryOverview);
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('CategoryOverview', () => {
  it('renders a card per top-level category linking into its grid', async () => {
    const el = await render(async () => tree);

    const headings = [...el.querySelectorAll('h2')].map((h) =>
      h.textContent?.trim(),
    );
    expect(headings).toEqual(['Coffee Beans', 'Tea']);

    const link = el.querySelector('a[href="/catalog/coffee-beans"]');
    expect(link).not.toBeNull();
  });

  it('renders subcategories as quick links, short name first', async () => {
    const el = await render(async () => tree);

    // 'Espresso Roasts' has a short name; 'Filter Roasts' falls back.
    expect(
      el.querySelector('a[href="/catalog/espresso"]')?.textContent,
    ).toContain('Espresso');
    expect(
      el.querySelector('a[href="/catalog/filter"]')?.textContent,
    ).toContain('Filter Roasts');
  });

  it('shows the placeholder for a category with no image', async () => {
    const el = await render(async () => tree);

    // 'Coffee Beans' has an image, 'Tea' does not → exactly one placeholder.
    expect(el.querySelectorAll('img')).toHaveLength(1);
    expect(el.querySelectorAll('app-image-placeholder')).toHaveLength(1);
  });

  it('shows an empty-state message when there are no categories', async () => {
    const el = await render(async () => []);

    expect(el.textContent).toContain(defaultAppText.catalog.emptyCategories);
  });

  it('shows an error message when the catalogue fails to load', async () => {
    const el = await render(async () => {
      throw new Error('boom');
    });

    expect(el.textContent).toContain(defaultAppText.catalog.loadError);
  });
});
