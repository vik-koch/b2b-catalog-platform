import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { MobileSearch, SearchAnchor } from './mobile-search';

/** An anchor whose row sits at the given offsets from the viewport's top. */
function anchorAt(bottom: number, top = 0): SearchAnchor & { focused: number } {
  const row = document.createElement('div');
  row.getBoundingClientRect = () => ({ bottom, top }) as DOMRect;
  const anchor = {
    row,
    focused: 0,
    focus() {
      anchor.focused += 1;
    },
  };
  return anchor;
}

/** The reals, captured at load and restored after each test: a leftover
 * global fails these only in CI. */
const realScrollTo = window.scrollTo;
const realMatchMedia = window.matchMedia;

function setUp() {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [provideRouter([{ path: '**', children: [] }])],
  });
  scrolled = [];
  window.scrollTo = ((options: ScrollToOptions) =>
    scrolled.push(options)) as typeof window.scrollTo;
  return TestBed.inject(MobileSearch);
}

/** Whether the visitor asked for less movement, stated: a smooth scroll is
 * for one who did not, and otherwise a test asserts an earlier spec's
 * `matchMedia`. */
function prefersReducedMotion(reduced: boolean): void {
  window.matchMedia = ((query: string) =>
    ({
      matches: query === '(prefers-reduced-motion: reduce)' && reduced,
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }) as unknown as MediaQueryList) as typeof window.matchMedia;
}

let scrolled: ScrollToOptions[] = [];

describe('MobileSearch', () => {
  afterEach(() => {
    document.documentElement.classList.remove('search-locked');
    document.body.style.top = '';
    window.scrollTo = realScrollTo;
    window.matchMedia = realMatchMedia;
  });

  // With the field in view, the search button puts the caret in it: no second
  // field, no lost place.
  it('focuses the header field while any of its row is on screen', () => {
    const search = setUp();
    const anchor = anchorAt(1);
    search.register(anchor);

    search.activate();

    expect(anchor.focused).toBe(1);
    expect(search.open()).toBe(false);
    // Whole and on screen, as on the results page or a page's top: moving the
    // page buys nothing.
    expect(scrolled).toEqual([]);
  });

  // Half of it showing means the page has moved on, and the rest of the header
  // is worth uncovering. The field itself is focused with `preventScroll`, so
  // this is the only scroll and it is a smooth one.
  it('brings a half-shown row back to the top', () => {
    const search = setUp();
    prefersReducedMotion(false);
    const anchor = anchorAt(10, -30);
    search.register(anchor);

    search.activate();

    expect(anchor.focused).toBe(1);
    expect(scrolled).toEqual([{ top: 0, behavior: 'smooth' }]);
  });

  // The same journey, for a visitor who has asked not to be moved through it.
  it('makes that trip instant where less movement was asked for', () => {
    const search = setUp();
    prefersReducedMotion(true);
    const anchor = anchorAt(10, -30);
    search.register(anchor);

    search.activate();

    expect(scrolled).toEqual([{ top: 0, behavior: 'auto' }]);
  });

  it('opens over the page once the row has scrolled away', () => {
    const search = setUp();
    const anchor = anchorAt(0);
    search.register(anchor);

    search.activate();

    expect(anchor.focused).toBe(0);
    expect(search.open()).toBe(true);
  });

  // Nothing to focus is the same situation as a field that has scrolled off.
  it('opens over the page when no header has lent a field', () => {
    const search = setUp();

    search.activate();

    expect(search.open()).toBe(true);
  });

  it('stops answering for a header that has gone', () => {
    const search = setUp();
    const anchor = anchorAt(1);
    search.register(anchor);
    search.release(anchor);

    search.activate();

    expect(anchor.focused).toBe(0);
    expect(search.open()).toBe(true);
  });

  // The page behind a keyboard must not move: it would take the field with it.
  // And handed back where it was: a fixed body not lifted by its scroll
  // offset jumps to the top.
  it('holds the page still, and gives it back where it was', () => {
    const search = setUp();
    const locked = () =>
      document.documentElement.classList.contains('search-locked');
    Object.defineProperty(window, 'scrollY', {
      value: 640,
      configurable: true,
    });

    search.activate();
    TestBed.tick();
    expect(locked()).toBe(true);
    expect(document.body.style.top).toBe('-640px');

    search.close();
    TestBed.tick();
    expect(locked()).toBe(false);
    expect(document.body.style.top).toBe('');
    expect(scrolled.at(-1)).toEqual({ top: 640, behavior: 'auto' });
  });

  // Submitting a query or picking a suggestion navigates, which is the same
  // thing as being done with the field.
  it('closes on the navigation a search causes', async () => {
    const search = setUp();
    search.activate();
    expect(search.open()).toBe(true);

    await TestBed.inject(Router).navigateByUrl('/search?q=espresso');

    expect(search.open()).toBe(false);
  });
});
