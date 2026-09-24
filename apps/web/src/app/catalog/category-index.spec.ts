import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { CategoryNode } from '@b2b-catalog-platform/shared';
import { APP_TEXT } from '../config/app-text';
import { defaultAppText } from '../config/app-text.fixture';
import { CatalogService } from './catalog.service';
import { CategoryIndex } from './category-index';

const node = (
  slug: string,
  name: string,
  extra: Partial<CategoryNode> = {},
): CategoryNode => ({
  slug,
  name,
  shortName: null,
  mark: null,
  children: [],
  ...extra,
});

const mark = {
  full: 'https://img.example/mark.jpg',
  thumb: 'https://img.example/mark-thumb.jpg',
};

const tree: CategoryNode[] = [
  node('coffee-beans', 'Coffee Beans', {
    mark,
    children: [
      node('espresso', 'Espresso Roasts', { shortName: 'Espresso' }),
      node('filter', 'Filter Roasts'),
      node('decaf', 'Decaf'),
      node('single-origin', 'Single Origin'),
      node('blends', 'Blends'),
      node('capsules', 'Capsules'),
    ],
  }),
  // No mark, no children: the plainest chip there is.
  node('tea', 'Tea'),
];

async function render(getCategoryTree: () => Promise<CategoryNode[]>) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [CategoryIndex],
    providers: [
      provideRouter([]),
      { provide: APP_TEXT, useValue: defaultAppText },
      { provide: CatalogService, useValue: { getCategoryTree } },
    ],
  });
  const fixture = TestBed.createComponent(CategoryIndex);
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

const el = (f: Awaited<ReturnType<typeof render>>) =>
  f.nativeElement as HTMLElement;

const link = (f: Awaited<ReturnType<typeof render>>, slug: string) =>
  el(f).querySelector(`a[href="/catalog/${slug}"]`);

const toggle = (f: Awaited<ReturnType<typeof render>>, label: string) =>
  [...el(f).querySelectorAll('button')].find((b) =>
    (b.textContent ?? '').includes(label),
  );

describe('CategoryIndex', () => {
  it('draws a chip per top-level category, linking into its listing', async () => {
    const f = await render(async () => tree);

    expect(el(f).querySelectorAll('app-category-chip')).toHaveLength(2);
    expect(link(f, 'coffee-beans')?.textContent).toContain('Coffee Beans');
    expect(link(f, 'tea')?.textContent).toContain('Tea');
  });

  it('shows a mark beside the name where there is one, and the name alone otherwise', async () => {
    const f = await render(async () => tree);

    const images = [...el(f).querySelectorAll('img')];
    expect(images).toHaveLength(1);
    expect(images[0].getAttribute('src')).toBe(mark.thumb);
    // No picture stands in for a missing mark: the category is its name.
    expect(link(f, 'tea')?.querySelector('img')).toBeNull();
  });

  it('names the first few subcategories under the chip, short name first', async () => {
    const f = await render(async () => tree);

    // 'Espresso Roasts' has a short name; 'Filter Roasts' falls back to its own.
    expect(link(f, 'espresso')?.textContent).toContain('Espresso');
    expect(link(f, 'filter')?.textContent).toContain('Filter Roasts');
  });

  it('opens the rest of the subcategories in place', async () => {
    const f = await render(async () => tree);

    // Every child is in the HTML from the start — the fifth and sixth are in a
    // row that is collapsed, which is what the crawler and the toggle both need.
    expect(link(f, 'capsules')).not.toBeNull();
    const row = () => link(f, 'capsules')?.closest('div');
    expect(row()?.className).toContain('grid-rows-[0fr]');

    toggle(f, defaultAppText.catalog.showMore)?.click();
    await f.whenStable();
    f.detectChanges();

    expect(row()?.className).toContain('grid-rows-[1fr]');
    expect(toggle(f, defaultAppText.catalog.showLess)).toBeTruthy();
  });

  it('offers no toggle where every subcategory is already named', async () => {
    const f = await render(async () => [tree[1]]);

    expect(toggle(f, defaultAppText.catalog.showMore)).toBeUndefined();
  });

  it('says so when there are no categories', async () => {
    const f = await render(async () => []);

    expect(el(f).textContent).toContain(defaultAppText.catalog.emptyCategories);
  });

  it('says so when the catalogue fails to load', async () => {
    const f = await render(async () => {
      throw new Error('boom');
    });

    expect(el(f).textContent).toContain(defaultAppText.catalog.loadError);
  });
});
