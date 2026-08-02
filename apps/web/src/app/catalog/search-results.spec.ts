import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Meta } from '@angular/platform-browser';
import { ProductListItem } from '@b2b-catalog-platform/shared';
import { APP_TEXT } from '../config/app-text';
import { defaultAppText } from '../config/app-text.fixture';
import { DEPLOYMENT_CONFIG } from '../config/deployment-config';
import { DeploymentConfig } from '../config/deployment-config.type';
import { CatalogService } from './catalog.service';
import { SearchResults } from './search-results';

const item = (slug: string, name: string): ProductListItem => ({
  slug,
  name,
  priceMinor: 1250,
  images: [],
});

type SearchResponse = {
  items: ProductListItem[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
};

const page = (items: ProductListItem[], totalPages = 1): SearchResponse => ({
  items,
  pagination: { page: 1, pageSize: 24, total: items.length, totalPages },
});

async function render(query: string, response: SearchResponse) {
  TestBed.configureTestingModule({
    imports: [SearchResults],
    providers: [
      provideRouter([]),
      { provide: APP_TEXT, useValue: defaultAppText },
      {
        provide: DEPLOYMENT_CONFIG,
        useValue: {
          branding: { title: 'Test Shop', name: 'Test Shop' },
          catalog: { currency: { code: 'EUR', locale: 'de-DE' } },
        } as unknown as DeploymentConfig,
      },
      {
        provide: CatalogService,
        useValue: { searchProducts: async () => response },
      },
    ],
  });
  const fixture = TestBed.createComponent(SearchResults);
  fixture.componentRef.setInput('q', query);
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('SearchResults', () => {
  it('lists matches in the order the API returned them (FR-SEARCH-03)', async () => {
    const el = await render(
      'espresso',
      page([
        item('hafen-espresso', 'Hafen Espresso'),
        item('espresso-dolce', 'Espresso Dolce'),
      ]),
    );

    // Relevance order is the server's; the page must not re-sort it.
    expect(
      [...el.querySelectorAll('h2')].map((h) => h.textContent?.trim()),
    ).toEqual(['Hafen Espresso', 'Espresso Dolce']);
  });

  it('shows the query back to the visitor', async () => {
    const el = await render('espresso', page([item('a', 'A')]));

    expect(el.querySelector('h1')?.textContent).toContain('espresso');
  });

  it('explains a miss instead of showing an empty grid', async () => {
    const el = await render('zzzz', page([]));

    expect(el.textContent).toContain('zzzz');
    expect(el.querySelector('ul')).toBeNull();
    // A dead end needs a way onward, not just an apology.
    expect(el.querySelector('a[href="/catalog"]')).not.toBeNull();
  });

  it('prompts rather than reporting a miss when there is no query at all', async () => {
    const el = await render('', page([]));

    expect(el.textContent).toContain(defaultAppText.search.emptyQuery);
  });

  it('keeps itself out of the index (NFR-SEO-04)', async () => {
    await render('espresso', page([item('a', 'A')]));

    expect(TestBed.inject(Meta).getTag('name="robots"')?.content).toBe(
      'noindex',
    );
  });

  it('carries the query into the pagination links', async () => {
    const el = await render('espresso', page([item('a', 'A')], 3));

    const next = [...el.querySelectorAll('a')].find((a) =>
      a.textContent?.includes(defaultAppText.catalog.nextPage),
    );
    expect(next?.getAttribute('href')).toContain('q=espresso');
    expect(next?.getAttribute('href')).toContain('page=2');
  });
});
