import { Location } from '@angular/common';
import { ApplicationRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { provideRouter, Router } from '@angular/router';
import { APP_TEXT } from '../config/app-text';
import { defaultAppText } from '../config/app-text.fixture';
import { SearchField } from './search-field';

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

  it('caps input length at the contract bound, so no request can 400 on it', async () => {
    const { el } = await render();

    const input = el.querySelector('input') as HTMLInputElement;
    expect(input.maxLength).toBe(100);
  });
});
