import { Location } from '@angular/common';
import { ApplicationRef, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { provideRouter, Router } from '@angular/router';
import { ProductListItem, SearchCategory } from '@b2b-catalog-platform/shared';
import { CartAddition, CartService } from '../cart/cart.service';
import { CatalogService } from '../catalog/catalog.service';
import { productListItem } from '../catalog/product.fixture';
import { APP_TEXT } from '../config/app-text';
import { defaultAppText } from '../config/app-text.fixture';
import { DEPLOYMENT_CONFIG } from '../config/deployment-config';
import { defaultDeploymentConfig } from '../config/deployment-config.fixture';
import { SearchField } from './search-field';

type Suggestion = ProductListItem;

/** A suggestion row — a whole tile, as the API sends it (FR-SEARCH-06). */
const row = (slug: string, name: string, overrides: Partial<Suggestion> = {}) =>
  productListItem({ slug, name, ...overrides });

/** What the stubbed API offers for any query. Set per test via `render`. */
let suggestions: Suggestion[] = [];
/** The categories offered beside them (FR-SEARCH-07). */
let categories: SearchCategory[] = [];

/**
 * When set, the next request hangs until the test resolves it — which is how
 * the in-flight window between two queries becomes something to assert on
 * rather than something to hope a timeout lands inside of.
 */
let hold: ((items: Suggestion[]) => void) | null = null;
let holdNext = false;

/** What the stubbed cart holds, and what it was asked to add. */
const cartLines = signal<string[]>([]);
let cartAdditions: CartAddition[] = [];
let cartFull = false;
const cartStub = {
  lineFor: (slug: string) =>
    cartLines().includes(slug) ? { slug } : undefined,
  add: (addition: CartAddition) => {
    if (cartFull) return 'full';
    cartAdditions.push(addition);
    cartLines.update((lines) => [...lines, addition.slug]);
    return 'added';
  },
};

/** A catalog service that answers from `suggestions`, so the field can be
 * driven without an HTTP layer under it. */
const catalogStub = {
  getSearchSuggestions: async () => {
    if (!holdNext) return { items: suggestions, categories };
    return new Promise<{ items: Suggestion[]; categories: SearchCategory[] }>(
      (resolve) => {
        hold = (items) => resolve({ items, categories: [] });
      },
    );
  },
};

async function render() {
  return renderAt();
}

/** Renders the field with the router already sitting on `url`, which is what
 * puts a `q` parameter in front of it — the field reads the live query params
 * rather than taking the query as an input. */
async function renderAt(url?: string) {
  TestBed.configureTestingModule({
    imports: [SearchField],
    providers: [
      provideRouter([{ path: '**', children: [] }]),
      { provide: APP_TEXT, useValue: defaultAppText },
      { provide: CatalogService, useValue: catalogStub },
      { provide: CartService, useValue: cartStub },
      { provide: DEPLOYMENT_CONFIG, useValue: defaultDeploymentConfig },
    ],
  });
  if (url) await TestBed.inject(Router).navigateByUrl(url);
  const fixture = TestBed.createComponent(SearchField);
  await fixture.whenStable();
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const navigate = vi.spyOn(TestBed.inject(Router), 'navigate');
  navigate.mockResolvedValue(true);
  return { fixture, el, navigate };
}

/** Types into the field the way a visitor would, then submits the form.
 * Returns the submit event, so a caller can check it was handled. */
function searchFor(el: HTMLElement, query: string): Event {
  const input = el.querySelector('input') as HTMLInputElement;
  input.value = query;
  input.dispatchEvent(new Event('input'));
  const event = new Event('submit', { cancelable: true });
  el.querySelector('form')?.dispatchEvent(event);
  return event;
}

describe('SearchField', () => {
  it('navigates to the results page with the query (FR-SEARCH-01)', async () => {
    const { el, navigate } = await render();

    searchFor(el, 'hafen espresso');

    expect(navigate).toHaveBeenCalledWith(['/search'], {
      queryParams: { q: 'hafen espresso' },
    });
  });

  it('trims the query, so a stray space is not searched for', async () => {
    const { el, navigate } = await render();

    searchFor(el, '  espresso  ');

    expect(navigate).toHaveBeenCalledWith(['/search'], {
      queryParams: { q: 'espresso' },
    });
  });

  it('does nothing on an empty submit rather than navigating to a blank page', async () => {
    const { el, navigate } = await render();

    searchFor(el, '   ');

    expect(navigate).not.toHaveBeenCalled();
  });

  it('routes instead of letting the browser submit the form', async () => {
    const { el } = await render();

    // Without this the browser also performs its own GET, and the full page
    // load races the router — landing back on the current page.
    expect(searchFor(el, 'espresso').defaultPrevented).toBe(true);
  });

  it('is a labelled search landmark with a real submit control', async () => {
    const { el } = await render();

    // Keyboard and screen-reader users get a form they can submit with Enter;
    // the icon button carries a text alternative rather than being decorative.
    const form = el.querySelector('form');
    expect(form?.getAttribute('role')).toBe('search');
    expect(form?.getAttribute('aria-label')).toBeTruthy();
    expect(el.querySelector('input')?.getAttribute('aria-label')).toBeTruthy();
    expect(
      el.querySelector('button[type="submit"]')?.textContent?.trim(),
    ).toBeTruthy();
  });

  it('prefills itself from ?q=, so a shared or reloaded result page shows its query', async () => {
    const { el } = await renderAt('/search?q=espresso%20cups');

    expect((el.querySelector('input') as HTMLInputElement).value).toBe(
      'espresso cups',
    );
  });

  it('is prefilled on its very first render, before the router has navigated', async () => {
    // The initial navigation is non-blocking, so the header renders once
    // before the router knows the URL. Reading `q` from the route alone would
    // show an empty field for that frame and then fill it in.
    TestBed.configureTestingModule({
      imports: [SearchField],
      providers: [
        provideRouter([{ path: '**', children: [] }]),
        { provide: APP_TEXT, useValue: defaultAppText },
        { provide: CatalogService, useValue: catalogStub },
        { provide: CartService, useValue: cartStub },
        { provide: DEPLOYMENT_CONFIG, useValue: defaultDeploymentConfig },
      ],
    });
    TestBed.inject(Location).go('/search', 'q=espresso');

    const fixture = TestBed.createComponent(SearchField);
    fixture.detectChanges();

    const input = fixture.nativeElement.querySelector(
      'input',
    ) as HTMLInputElement;
    expect(input.value).toBe('espresso');
  });

  it('lets the visitor keep editing: a search does not fight what is typed', async () => {
    const { el, fixture } = await renderAt('/search?q=espresso');

    const input = el.querySelector('input') as HTMLInputElement;
    input.value = 'espresso cups';
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();

    expect((el.querySelector('input') as HTMLInputElement).value).toBe(
      'espresso cups',
    );
  });

  it('offers its own clear control once there is something to clear', async () => {
    const { el } = await render();

    // Nothing to clear on an empty field, so the control is absent rather than
    // present-but-inert. The browser's native one is suppressed in CSS.
    expect(el.querySelectorAll('button')).toHaveLength(1);

    const input = el.querySelector('input') as HTMLInputElement;
    input.value = 'espresso';
    input.dispatchEvent(new Event('input'));
    await TestBed.inject(ApplicationRef).whenStable();

    const clear = el.querySelector(
      'button[type="button"]',
    ) as HTMLButtonElement;
    expect(clear).not.toBeNull();

    clear.click();
    await TestBed.inject(ApplicationRef).whenStable();

    // Cleared, and the control retires with the text it existed for.
    expect((el.querySelector('input') as HTMLInputElement).value).toBe('');
    expect(el.querySelector('button[type="button"]')).toBeNull();
  });

  it('submits to the results page on its own, for a visitor without JavaScript', async () => {
    const { el } = await render();

    // A form without these submits to the *current* URL, so the search box on
    // the home page would navigate to /?q=… and appear to do nothing. The
    // handler above preempts this whenever scripting is available.
    const form = el.querySelector('form') as HTMLFormElement;
    expect(form.getAttribute('action')).toBe('/search');
    expect(form.getAttribute('method')).toBe('get');
    expect(el.querySelector('input')?.getAttribute('name')).toBe('q');
  });

  it('caps input length at the contract bound, so no request can 400 on it', async () => {
    const { el } = await render();

    const input = el.querySelector('input') as HTMLInputElement;
    expect(input.maxLength).toBe(100);
  });
});

/**
 * FR-SEARCH-05. The suggestion list is an accelerator over the form above, so
 * these cover both halves of that: that picking one is a shortcut to a
 * product, and that the plain query submit underneath it stays reachable.
 */
describe('SearchField suggestions (FR-SEARCH-05/06)', () => {
  beforeEach(() => {
    suggestions = [
      row('hafen-espresso', 'Hafen Espresso'),
      row('espresso-dolce', 'Espresso Dolce'),
    ];
  });

  afterEach(() => {
    suggestions = [];
    hold = null;
    holdNext = false;
    cartLines.set([]);
    cartAdditions = [];
    cartFull = false;
    categories = [];
  });

  /** Types, then waits out the debounce and the stubbed request. Real timers:
   * the debounce is a plain timeout and 250ms is cheaper than teaching the
   * fake clock about Angular's scheduling. */
  async function typeQuery(
    fixture: { whenStable: () => Promise<unknown> },
    el: HTMLElement,
    query: string,
  ) {
    await typePending(el, query);
    await fixture.whenStable();
    await TestBed.inject(ApplicationRef).whenStable();
  }

  /**
   * Types and waits out only the debounce, never for stability — a held
   * request keeps the application unstable by definition, so a test that
   * wants to look at the in-flight moment cannot also wait for it to pass.
   */
  async function typePending(el: HTMLElement, query: string) {
    const input = el.querySelector('input') as HTMLInputElement;
    input.value = query;
    input.dispatchEvent(new Event('input'));
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  /** Each row's product cell — the part that goes to the product. */
  const options = (el: HTMLElement) =>
    Array.from(
      el.querySelectorAll<HTMLElement>(
        '[role="rowgroup"] [role="gridcell"]:first-child',
      ),
    );
  const names = (el: HTMLElement) =>
    options(el).map((o) =>
      o.querySelector('app-highlighted-line')?.textContent?.trim(),
    );
  const addButtons = (el: HTMLElement) =>
    Array.from(
      el.querySelectorAll<HTMLButtonElement>('[role="rowgroup"] button'),
    );

  const press = (el: HTMLElement, key: string): KeyboardEvent => {
    const event = new KeyboardEvent('keydown', { key, cancelable: true });
    (el.querySelector('input') as HTMLInputElement).dispatchEvent(event);
    return event;
  };

  it('shows each suggestion with its picture and per-piece price (FR-SEARCH-06)', async () => {
    suggestions = [
      row('hafen-espresso', 'Hafen Espresso', {
        images: [{ full: '/f.webp', thumb: '/t.webp', variant: null }],
        prices: { piece: 1250, pack: 7500, box: null },
      }),
    ];
    const { el, fixture } = await render();

    await typeQuery(fixture, el, 'espresso');

    const cell = options(el)[0];
    expect(cell.querySelector('img')?.getAttribute('src')).toBe('/t.webp');
    // The piece price, not the pack's: a listing leads with it (FR-UNIT-08).
    expect(cell.textContent).toContain('12');
    expect(cell.textContent).toContain('50');
    expect(cell.textContent).not.toContain('75');
  });

  it('draws the placeholder for a product without a picture', async () => {
    const { el, fixture } = await render();

    await typeQuery(fixture, el, 'espresso');

    expect(
      options(el)[0].querySelector('app-image-placeholder'),
    ).not.toBeNull();
  });

  it('adds the smallest order to the cart and keeps the list open', async () => {
    suggestions = [
      row('hafen-espresso', 'Hafen Espresso', {
        packaging: { piecesPerPack: 6, packsPerBox: 4, minPieceQty: 6 },
      }),
    ];
    const { el, fixture, navigate } = await render();
    await typeQuery(fixture, el, 'espresso');

    addButtons(el)[0].click();
    await fixture.whenStable();

    expect(cartAdditions).toHaveLength(1);
    expect(cartAdditions[0]).toMatchObject({
      slug: 'hafen-espresso',
      unit: 'piece',
      pieces: 6,
      note: null,
    });
    // Filling a cart from one query: the panel is still there for the next.
    expect(navigate).not.toHaveBeenCalled();
    expect(
      (el.querySelector('input') as HTMLInputElement).getAttribute(
        'aria-expanded',
      ),
    ).toBe('true');
  });

  it('marks a product already in the cart instead of offering it again', async () => {
    cartLines.set(['espresso-dolce']);
    const { el, fixture } = await render();

    await typeQuery(fixture, el, 'espresso');

    expect(addButtons(el)).toHaveLength(1);
    const mark = el.querySelector(
      '[role="row"]:nth-child(2) [role="gridcell"]:last-child [role="img"]',
    );
    expect(mark?.getAttribute('aria-label')).toContain('Espresso Dolce');
  });

  it('switches the button off for a product out of stock', async () => {
    suggestions = [
      row('hafen-espresso', 'Hafen Espresso', { availability: 'out' }),
    ];
    const { el, fixture } = await render();

    await typeQuery(fixture, el, 'espresso');

    expect(addButtons(el)[0].disabled).toBe(true);
  });

  it('says so when the cart is full', async () => {
    cartFull = true;
    const { el, fixture } = await render();
    await typeQuery(fixture, el, 'espresso');

    addButtons(el)[0].click();
    await fixture.whenStable();

    expect(el.textContent).toContain(defaultAppText.cart.full);
  });

  it('reaches the add button from the keyboard with the right arrow', async () => {
    const { el, fixture, navigate } = await render();
    await typeQuery(fixture, el, 'espresso');
    const input = el.querySelector('input') as HTMLInputElement;

    press(el, 'ArrowDown');
    expect(press(el, 'ArrowRight').defaultPrevented).toBe(true);
    await fixture.whenStable();
    expect(input.getAttribute('aria-activedescendant')).toMatch(/-0-1$/);

    const enter = press(el, 'Enter');
    await fixture.whenStable();

    expect(enter.defaultPrevented).toBe(true);
    expect(cartAdditions.map((a) => a.slug)).toEqual(['hafen-espresso']);
    expect(navigate).not.toHaveBeenCalled();

    // And back to the product, which Enter opens.
    press(el, 'ArrowLeft');
    press(el, 'Enter');
    expect(navigate).toHaveBeenCalledWith(['/product', 'hafen-espresso']);
  });

  it('leaves the arrows to the caret while no row is selected', async () => {
    const { el, fixture } = await render();
    await typeQuery(fixture, el, 'espresso');

    expect(press(el, 'ArrowRight').defaultPrevented).toBe(false);
    expect(press(el, 'ArrowLeft').defaultPrevented).toBe(false);
  });

  it('goes to the results page from the panel footer', async () => {
    const { el, fixture, navigate } = await render();
    await typeQuery(fixture, el, 'espresso');

    const showAll = Array.from(el.querySelectorAll('button')).find((b) =>
      b.textContent?.includes(defaultAppText.search.showAllResults),
    );
    showAll?.click();

    expect(navigate).toHaveBeenCalledWith(['/search'], {
      queryParams: { q: 'espresso' },
    });
  });

  describe('categories among them (FR-SEARCH-07)', () => {
    const category = (slug: string, name: string, parent: string | null) => ({
      slug,
      name,
      shortName: null,
      mark: null,
      parent,
    });
    const chips = (el: HTMLElement) =>
      Array.from(el.querySelectorAll<HTMLElement>('app-category-chip'));

    beforeEach(() => {
      categories = [
        category('espresso', 'Espresso Roasts', 'Coffee Beans'),
        category('machines', 'Espresso Machines', 'Equipment'),
      ];
    });

    it('offers them as chips ahead of the products, each with its parent', async () => {
      const { el, fixture } = await render();

      await typeQuery(fixture, el, 'espresso');

      const rows = el.querySelectorAll('[role="row"]');
      expect(rows[0].querySelectorAll('app-category-chip')).toHaveLength(2);
      expect(chips(el)[0].textContent).toContain('Espresso Roasts');
      expect(chips(el)[0].textContent).toContain('Coffee Beans');
      expect(chips(el)[0].querySelector('mark')?.textContent).toBe('Espresso');
      expect(names(el)).toEqual(['Hafen Espresso', 'Espresso Dolce']);
    });

    it('leaves the strip out where the query names no category', async () => {
      categories = [];
      const { el, fixture } = await render();

      await typeQuery(fixture, el, 'espresso');

      expect(chips(el)).toHaveLength(0);
    });

    it('walks the chips sideways and opens the one Enter is on', async () => {
      const { el, fixture, navigate } = await render();
      await typeQuery(fixture, el, 'espresso');
      const input = el.querySelector('input') as HTMLInputElement;

      press(el, 'ArrowDown');
      await fixture.whenStable();
      expect(input.getAttribute('aria-activedescendant')).toMatch(/-0-0$/);

      press(el, 'ArrowRight');
      // Stops at the last chip rather than running off the strip.
      press(el, 'ArrowRight');
      await fixture.whenStable();
      expect(input.getAttribute('aria-activedescendant')).toMatch(/-0-1$/);

      expect(press(el, 'Enter').defaultPrevented).toBe(true);
      expect(navigate).toHaveBeenCalledWith(['/catalog', 'machines']);
    });

    it('goes on from the strip to the products below it', async () => {
      const { el, fixture, navigate } = await render();
      await typeQuery(fixture, el, 'espresso');

      press(el, 'ArrowDown');
      press(el, 'ArrowDown');
      press(el, 'Enter');

      expect(navigate).toHaveBeenCalledWith(['/product', 'hafen-espresso']);
    });

    it('closes when the chip pressed is the category already open', async () => {
      // The link goes nowhere, and a panel left open over the page it asked
      // for reads as a press that did nothing.
      const { el, fixture } = await renderAt('/catalog/espresso');
      await typeQuery(fixture, el, 'espresso');

      chips(el)[0].querySelector('a')?.click();
      await fixture.whenStable();

      expect(
        (el.querySelector('input') as HTMLInputElement).getAttribute(
          'aria-expanded',
        ),
      ).toBe('false');
    });

    it('counts the categories in what it announces', async () => {
      const { el, fixture } = await render();

      await typeQuery(fixture, el, 'espresso');

      expect(el.querySelector('[aria-live]')?.textContent).toContain('4');
    });
  });

  it('offers matching product names once a query is typed', async () => {
    const { el, fixture } = await render();

    expect(options(el)).toHaveLength(0);
    await typeQuery(fixture, el, 'espresso');

    expect(names(el)).toEqual(['Hafen Espresso', 'Espresso Dolce']);
  });

  it('marks the part of the name the query matched', async () => {
    const { el, fixture } = await render();

    await typeQuery(fixture, el, 'espresso');

    // Only the matched run is marked — the rest of the name is plain, so the
    // tint is telling the visitor why this row is here. <mark>, the same
    // element the address and company fields draw.
    expect(
      options(el).map((o) => o.querySelector('mark')?.textContent),
    ).toEqual(['Espresso', 'Espresso']);
  });

  it('renders a name the query split mid-word without breaking the word', async () => {
    // The segments are adjacent runs of one word: any whitespace between them
    // in the template renders as a space, and "Grinder" would come out as
    // "Grinde r" on screen.
    suggestions = [row('kontor-hand-grinder', 'Kontor Hand Grinder')];
    const { el, fixture } = await render();

    await typeQuery(fixture, el, 'grinde');

    expect(names(el)[0]).toBe('Kontor Hand Grinder');
  });

  it('goes straight to the product when one is picked', async () => {
    const { el, fixture, navigate } = await render();

    await typeQuery(fixture, el, 'espresso');
    options(el)[1].dispatchEvent(
      new MouseEvent('mousedown', { bubbles: true, cancelable: true }),
    );

    expect(navigate).toHaveBeenCalledWith(['/product', 'espresso-dolce']);
  });

  it('still submits the typed query when no suggestion is selected', async () => {
    const { el, fixture, navigate } = await render();

    // The requirement's other half: suggestions must not become the only way
    // out of the field. Enter without an arrow-key selection searches.
    await typeQuery(fixture, el, 'espresso');
    el.querySelector('form')?.dispatchEvent(
      new Event('submit', { cancelable: true }),
    );

    expect(navigate).toHaveBeenCalledWith(['/search'], {
      queryParams: { q: 'espresso' },
    });
  });

  it('navigates to the selected suggestion on Enter, not to the results page', async () => {
    const { el, fixture, navigate } = await render();

    await typeQuery(fixture, el, 'espresso');
    press(el, 'ArrowDown');
    await fixture.whenStable();
    const enter = press(el, 'Enter');

    expect(enter.defaultPrevented).toBe(true);
    expect(navigate).toHaveBeenCalledWith(['/product', 'hafen-espresso']);
  });

  it('walks the list with the arrow keys and back out to the typed query', async () => {
    const { el, fixture } = await render();
    await typeQuery(fixture, el, 'espresso');
    const input = el.querySelector('input') as HTMLInputElement;

    const activeName = async () => {
      await fixture.whenStable();
      const id = input.getAttribute('aria-activedescendant');
      return id
        ? el
            .querySelector(`#${id}`)
            ?.querySelector('app-highlighted-line')
            ?.textContent?.trim()
        : null;
    };

    expect(await activeName()).toBeNull();
    press(el, 'ArrowDown');
    expect(await activeName()).toBe('Hafen Espresso');
    press(el, 'ArrowDown');
    expect(await activeName()).toBe('Espresso Dolce');
    // Past the last option is "nothing selected" again, which is what puts the
    // typed query back within one keystroke instead of trapping the selection.
    press(el, 'ArrowDown');
    expect(await activeName()).toBeNull();
  });

  it('dismisses the list on Escape without clearing what was typed', async () => {
    const { el, fixture } = await render();
    await typeQuery(fixture, el, 'espresso');

    expect(press(el, 'Escape').defaultPrevented).toBe(true);
    await fixture.whenStable();

    expect(options(el)).toHaveLength(0);
    expect((el.querySelector('input') as HTMLInputElement).value).toBe(
      'espresso',
    );
    // A second press is left to the browser, whose own behaviour on a search
    // input is to clear it.
    expect(press(el, 'Escape').defaultPrevented).toBe(false);
  });

  it('does not open on a prefilled query, only on typing', async () => {
    // Landing on /search?q=… fills the field from the URL. A dropdown over the
    // results the visitor just asked for would be covering the answer.
    const { el, fixture } = await renderAt('/search?q=espresso');
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve, 250));
    await TestBed.inject(ApplicationRef).whenStable();

    expect(options(el)).toHaveLength(0);
  });

  it('exposes the field as a combobox over its list', async () => {
    const { el, fixture } = await render();
    const input = el.querySelector('input') as HTMLInputElement;
    const list = el.querySelector('[role="grid"]') as HTMLElement;

    expect(input.getAttribute('role')).toBe('combobox');
    expect(input.getAttribute('aria-controls')).toBe(list.id);
    expect(input.getAttribute('aria-expanded')).toBe('false');

    await typeQuery(fixture, el, 'espresso');

    expect(input.getAttribute('aria-expanded')).toBe('true');
    expect(list.getAttribute('aria-label')).toBeTruthy();
  });

  it('says so when nothing matches, rather than showing an empty box', async () => {
    suggestions = [];
    const { el, fixture } = await render();

    await typeQuery(fixture, el, 'zzzz');

    expect(options(el)).toHaveLength(0);
    expect(el.textContent).toContain(defaultAppText.search.noSuggestions);
    expect(
      (el.querySelector('input') as HTMLInputElement).getAttribute(
        'aria-expanded',
      ),
    ).toBe('true');
  });

  it('keeps the previous names up while the next query is in flight', async () => {
    // The panel emptying and refilling between two keystrokes reads as a
    // flicker. One more letter usually narrows the same list, so the previous
    // answer is the best placeholder for the next one.
    const { el, fixture } = await render();
    await typeQuery(fixture, el, 'espresso');

    holdNext = true;
    await typePending(el, 'espresso d');
    fixture.detectChanges();

    expect(names(el)).toEqual(['Hafen Espresso', 'Espresso Dolce']);

    holdNext = false;
    hold?.([row('espresso-dolce', 'Espresso Dolce')]);
    await fixture.whenStable();
    await TestBed.inject(ApplicationRef).whenStable();

    expect(names(el)).toEqual(['Espresso Dolce']);
  });

  it('does not flash "nothing found" on the way to a first answer', async () => {
    // Only a resolved empty answer is "nothing found". A pending one is not,
    // and saying so before the reply lands would be a lie that corrects
    // itself a moment later.
    const { el, fixture } = await render();

    holdNext = true;
    await typePending(el, 'espresso');
    fixture.detectChanges();

    expect(el.textContent).not.toContain(defaultAppText.search.noSuggestions);
    expect(
      (el.querySelector('input') as HTMLInputElement).getAttribute(
        'aria-expanded',
      ),
    ).toBe('false');
  });

  it('stays open across the gap between "nothing found" and the next answer', async () => {
    // Closing while the next request is in flight would blink the box out and
    // back for a beat — a glitch, not an answer.
    const { el, fixture } = await render();

    suggestions = [];
    await typeQuery(fixture, el, 'zzz');
    expect(el.textContent).toContain(defaultAppText.search.noSuggestions);

    holdNext = true;
    await typePending(el, 'zzz espresso');
    fixture.detectChanges();

    expect(
      (el.querySelector('input') as HTMLInputElement).getAttribute(
        'aria-expanded',
      ),
    ).toBe('true');

    holdNext = false;
    hold?.([row('espresso-dolce', 'Espresso Dolce')]);
    await fixture.whenStable();
    await TestBed.inject(ApplicationRef).whenStable();

    expect(names(el)).toEqual(['Espresso Dolce']);
  });
});
