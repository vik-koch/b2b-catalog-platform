import { Location } from '@angular/common';
import { ApplicationRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { provideRouter, Router } from '@angular/router';
import { CatalogService } from '../catalog/catalog.service';
import { APP_TEXT } from '../config/app-text';
import { defaultAppText } from '../config/app-text.fixture';
import { SearchField } from './search-field';

type Suggestion = { slug: string; name: string };

/** What the stubbed API offers for any query. Set per test via `render`. */
let suggestions: Suggestion[] = [];

/**
 * When set, the next request hangs until the test resolves it — which is how
 * the in-flight window between two queries becomes something to assert on
 * rather than something to hope a timeout lands inside of.
 */
let hold: ((items: Suggestion[]) => void) | null = null;
let holdNext = false;

/** A catalog service that answers from `suggestions`, so the field can be
 * driven without an HTTP layer under it. */
const catalogStub = {
  getSearchSuggestions: async () => {
    if (!holdNext) return suggestions;
    return new Promise<Suggestion[]>((resolve) => {
      hold = resolve;
    });
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
describe('SearchField suggestions (FR-SEARCH-05)', () => {
  beforeEach(() => {
    suggestions = [
      { slug: 'hafen-espresso', name: 'Hafen Espresso' },
      { slug: 'espresso-dolce', name: 'Espresso Dolce' },
    ];
  });

  afterEach(() => {
    suggestions = [];
    hold = null;
    holdNext = false;
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

  const options = (el: HTMLElement) =>
    Array.from(el.querySelectorAll('[role="option"]'));

  const press = (el: HTMLElement, key: string): KeyboardEvent => {
    const event = new KeyboardEvent('keydown', { key, cancelable: true });
    (el.querySelector('input') as HTMLInputElement).dispatchEvent(event);
    return event;
  };

  it('offers matching product names once a query is typed', async () => {
    const { el, fixture } = await render();

    expect(options(el)).toHaveLength(0);
    await typeQuery(fixture, el, 'espresso');

    expect(options(el).map((o) => o.textContent?.trim())).toEqual([
      'Hafen Espresso',
      'Espresso Dolce',
    ]);
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
    suggestions = [
      { slug: 'kontor-hand-grinder', name: 'Kontor Hand Grinder' },
    ];
    const { el, fixture } = await render();

    await typeQuery(fixture, el, 'grinde');

    expect(options(el)[0].textContent?.trim()).toBe('Kontor Hand Grinder');
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
      return id ? el.querySelector(`#${id}`)?.textContent?.trim() : null;
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
    const list = el.querySelector('[role="listbox"]') as HTMLElement;

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

    expect(options(el).map((o) => o.textContent?.trim())).toEqual([
      'Hafen Espresso',
      'Espresso Dolce',
    ]);

    holdNext = false;
    hold?.([{ slug: 'espresso-dolce', name: 'Espresso Dolce' }]);
    await fixture.whenStable();
    await TestBed.inject(ApplicationRef).whenStable();

    expect(options(el).map((o) => o.textContent?.trim())).toEqual([
      'Espresso Dolce',
    ]);
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
    hold?.([{ slug: 'espresso-dolce', name: 'Espresso Dolce' }]);
    await fixture.whenStable();
    await TestBed.inject(ApplicationRef).whenStable();

    expect(options(el).map((o) => o.textContent?.trim())).toEqual([
      'Espresso Dolce',
    ]);
  });
});
