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
    mark: null,
    children: [
      {
        slug: 'espresso',
        name: 'Espresso Roasts',
        shortName: 'Espresso',
        image: null,
        mark: null,
        children: [],
      },
      {
        slug: 'filter',
        name: 'Filter Roasts',
        shortName: null,
        image: null,
        mark: null,
        children: [],
      },
    ],
  },
  {
    slug: 'tea',
    name: 'Tea',
    shortName: null,
    image: null,
    mark: null,
    children: [],
  },
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
  it('heads the index with its own title', async () => {
    const el = await render(async () => tree);

    expect(el.querySelector('h1')?.textContent).toContain(
      defaultAppText.catalog.overviewTitle,
    );
  });

  it('shows the categories as the index draws them', async () => {
    const el = await render(async () => tree);

    // The chips, the subcategory names and their states are CategoryIndex's
    // own; this page only has to put it under the heading.
    expect(el.querySelector('app-category-index')).not.toBeNull();
    expect(
      el.querySelector('a[href="/catalog/coffee-beans"]')?.textContent,
    ).toContain('Coffee Beans');
  });
});
