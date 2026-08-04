import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { APP_TEXT } from '../config/app-text';
import { defaultAppText } from '../config/app-text.fixture';
import { CatalogLink } from './catalog-link';

async function render() {
  TestBed.configureTestingModule({
    imports: [CatalogLink],
    providers: [
      provideRouter([
        { path: 'catalog', children: [] },
        { path: 'catalog/:slug', children: [] },
        { path: 'product/:slug', children: [] },
        { path: 'search', children: [] },
        { path: 'contact', children: [] },
      ]),
      { provide: APP_TEXT, useValue: defaultAppText },
    ],
  });

  const fixture = TestBed.createComponent(CatalogLink);
  await fixture.whenStable();
  const el = fixture.nativeElement as HTMLElement;
  return {
    current: () => el.querySelector('a')?.getAttribute('aria-current'),
    go: async (url: string) => {
      await TestBed.inject(Router).navigateByUrl(url);
      fixture.detectChanges();
      await fixture.whenStable();
    },
  };
}

describe('CatalogLink', () => {
  // Product pages and search results are their own top-level routes, so a
  // prefix match on /catalog alone would drop the highlight mid-browse.
  it('stays the current page across every catalogue-browsing route', async () => {
    const { current, go } = await render();

    await go('/catalog');
    expect(current()).toBe('page');

    await go('/catalog/espresso?page=2');
    expect(current()).toBe('page');

    await go('/product/hafen-espresso');
    expect(current()).toBe('page');

    await go('/search?q=espresso');
    expect(current()).toBe('page');
  });

  it('drops the marker off the catalogue', async () => {
    const { current, go } = await render();

    await go('/contact');

    expect(current()).toBeNull();
  });
});
