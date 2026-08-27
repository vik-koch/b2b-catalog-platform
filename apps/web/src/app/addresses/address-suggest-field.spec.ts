import { TestBed } from '@angular/core/testing';
import { FormControl } from '@angular/forms';
import {
  AddressComponents,
  AddressSuggestion,
} from '@b2b-catalog-platform/shared';
import { defaultAppText } from '../config/app-text.fixture';
import { AddressSuggestField } from './address-suggest-field';
import { AddressesService } from './addresses.service';

const text = defaultAppText.auth.myAccount.addresses;

/** What the stubbed provider answers with; set per test. */
let answers: AddressSuggestion[] = [];

const suggestion = (
  label: string,
  components: AddressComponents,
): AddressSuggestion => ({ label, components });

/** Set by a test that wants the request itself to fail, not merely answer
 * nothing — the API is a network away, and a customer typing is not. */
let rejects = false;

async function render() {
  const suggest = vi.fn(async () => {
    if (rejects) throw new Error('network');
    return answers;
  });
  TestBed.configureTestingModule({
    imports: [AddressSuggestField],
    providers: [{ provide: AddressesService, useValue: { suggest } }],
  });

  const fixture = TestBed.createComponent(AddressSuggestField);
  fixture.componentRef.setInput(
    'control',
    new FormControl('', { nonNullable: true }),
  );
  fixture.componentRef.setInput('label', text.street);
  fixture.componentRef.setInput('text', {
    suggestionsLabel: text.suggestionsLabel,
    noSuggestions: text.noSuggestions,
    suggestionCount: text.suggestionCount,
  });
  await fixture.whenStable();
  fixture.detectChanges();

  const el = fixture.nativeElement as HTMLElement;
  const input = el.querySelector('input') as HTMLInputElement;
  const picked: AddressComponents[] = [];
  fixture.componentInstance.picked.subscribe((c) => picked.push(c));

  return {
    fixture,
    el,
    input,
    picked,
    suggest,
    /** Types, then waits out the debounce and the stubbed request. Real timers:
     * the debounce is a plain timeout, and 350ms is cheaper than teaching the
     * test environment about fake ones. */
    type: async (value: string) => {
      input.value = value;
      input.dispatchEvent(new Event('input'));
      await new Promise((resolve) => setTimeout(resolve, 350));
      await fixture.whenStable();
      fixture.detectChanges();
    },
  };
}

describe('AddressSuggestField (FR-CART-11)', () => {
  beforeEach(() => {
    rejects = false;
    answers = [
      suggestion('Hafenstraße 12, 20359 Hamburg', {
        street: 'Hafenstraße 12',
        postalCode: '20359',
        city: 'Hamburg',
        country: 'DE',
      }),
    ];
  });

  // Every call here is a paid one at a provider, and two letters match half a
  // country: the field waits until the query could mean something.
  it('asks for nothing until enough has been typed', async () => {
    const { type, suggest, el } = await render();

    await type('Ha');

    expect(suggest).not.toHaveBeenCalled();
    expect(el.querySelector('[role="listbox"]')).toBeNull();
  });

  it('offers what the provider answers once the typing settles', async () => {
    const { type, el, suggest } = await render();

    await type('Hafenstra');

    expect(suggest).toHaveBeenCalledTimes(1);
    expect(el.querySelectorAll('[role="option"]')).toHaveLength(1);
    expect(el.textContent).toContain('Hafenstraße 12, 20359 Hamburg');
  });

  it('marks the parts of the line the query matched', async () => {
    const { type, el } = await render();

    await type('Hafenstra');

    // Only the matched run is marked — the rest of the line is plain, so the
    // tint is telling the customer why this row is here.
    expect(
      [...el.querySelectorAll('[role="option"] mark')].map(
        (m) => m.textContent,
      ),
    ).toEqual(['Hafenstra']);
  });

  // The segments are adjacent runs of one word: any whitespace between them in
  // the template renders as a space, and the street would come out as
  // "Hafenstra ße 12" on screen.
  it('renders a line the query split mid-word without breaking the word', async () => {
    const { type, el } = await render();

    await type('Hafenstra');

    expect(el.querySelector('[role="option"] > span')?.textContent).toBe(
      'Hafenstraße 12, 20359 Hamburg',
    );
  });

  // Two streets of the same name in two towns are one row repeated otherwise.
  it('names the region under the line where the provider gave one', async () => {
    answers = [
      suggestion('Hafenstraße 12, 20359 Hamburg', {
        street: 'Hafenstraße 12',
        postalCode: '20359',
        city: 'Hamburg',
        region: 'Schleswig-Holstein',
        country: 'DE',
      }),
    ];
    const { type, el } = await render();

    await type('Hafenstra');

    expect(el.textContent).toContain('Schleswig-Holstein');
  });

  // A provider answers at whatever granularity it has, and a city that is its
  // own region says the same word twice.
  it('draws no second line where it gave none', async () => {
    const { type, el } = await render();

    await type('Hafenstra');

    expect(el.querySelectorAll('[role="option"] > span')).toHaveLength(1);
  });

  it('emits the picked row’s components, not its label', async () => {
    const { type, el, picked } = await render();

    await type('Hafenstra');
    el.querySelector<HTMLElement>('[role="option"]')?.dispatchEvent(
      new MouseEvent('mousedown', { bubbles: true }),
    );

    expect(picked).toEqual([
      {
        street: 'Hafenstraße 12',
        postalCode: '20359',
        city: 'Hamburg',
        country: 'DE',
      },
    ]);
  });

  it('closes the list once a row is picked', async () => {
    const { fixture, type, el } = await render();

    await type('Hafenstra');
    el.querySelector<HTMLElement>('[role="option"]')?.dispatchEvent(
      new MouseEvent('mousedown', { bubbles: true }),
    );
    fixture.detectChanges();

    expect(el.querySelector('[role="listbox"]')).toBeNull();
  });

  it('says so when the provider knows nothing, rather than showing an empty box', async () => {
    answers = [];
    const { type, el } = await render();

    await type('Hafenstra');

    expect(el.textContent).toContain(text.noSuggestions);
  });

  // The default deployment configures no adapter, so this is the ordinary case:
  // an empty answer must leave an ordinary text field behind.
  it('keeps the typed value whatever the provider says', async () => {
    answers = [];
    const { type, input } = await render();

    await type('Somewhere the provider has never heard of');

    expect(input.value).toBe('Somewhere the provider has never heard of');
  });

  // A suggestion is an accelerator, never a step. A sidecar the API cannot
  // reach answers with an empty list, but the API itself can be unreachable —
  // and a failed request must leave the customer typing, not take the form with
  // it.
  it('keeps the field usable when the request fails outright', async () => {
    rejects = true;
    const { type, input, el } = await render();

    await type('Hafenstraße 12');

    expect(input.value).toBe('Hafenstraße 12');
    expect(el.querySelectorAll('[role="option"]')).toHaveLength(0);
    // And typing on still works, rather than the field being stuck on the
    // failure.
    rejects = false;
    await type('Hafenstraße 13');
    expect(el.querySelectorAll('[role="option"]')).toHaveLength(1);
  });
});
