import { TestBed } from '@angular/core/testing';
import { FormControl } from '@angular/forms';
import { PartySuggestion } from '@b2b-catalog-platform/shared';
import { PartiesService } from './parties.service';
import { PartySuggestField } from './party-suggest-field';

/** What the stubbed provider answers with; set per test. */
let answers: PartySuggestion[] = [];
let rejects = false;

const kontor: PartySuggestion = {
  name: 'Kontor GmbH',
  registrationId: 'DE123456789',
  entityType: 'legal',
  address: { city: 'Hamburg', postalCode: '20359' },
};

const text = {
  suggestionsLabel: 'Company suggestions',
  noSuggestions: 'No matching companies. Carry on typing it yourself.',
  suggestionCount: '{count} company suggestions',
};

async function render() {
  const suggest = vi.fn(async () => {
    if (rejects) throw new Error('network');
    return answers;
  });

  TestBed.configureTestingModule({
    imports: [PartySuggestField],
    providers: [{ provide: PartiesService, useValue: { suggest } }],
  });

  const fixture = TestBed.createComponent(PartySuggestField);
  fixture.componentRef.setInput(
    'control',
    new FormControl('', { nonNullable: true }),
  );
  fixture.componentRef.setInput('label', 'Company name');
  fixture.componentRef.setInput('text', text);
  await fixture.whenStable();
  fixture.detectChanges();

  const el = fixture.nativeElement as HTMLElement;
  const input = el.querySelector('input') as HTMLInputElement;
  const picked: PartySuggestion[] = [];
  fixture.componentInstance.picked.subscribe((p) => picked.push(p));

  return {
    fixture,
    el,
    input,
    picked,
    suggest,
    /** Types, then waits out the debounce and the stubbed request. */
    type: async (value: string) => {
      input.value = value;
      input.dispatchEvent(new Event('input'));
      await new Promise((resolve) => setTimeout(resolve, 350));
      await fixture.whenStable();
      fixture.detectChanges();
    },
  };
}

describe('PartySuggestField (FR-AUTH-09)', () => {
  beforeEach(() => {
    answers = [kontor];
    rejects = false;
  });

  // Every call here is a paid one at a provider, and two letters match half a
  // register: the field waits until the query could mean something.
  it('asks for nothing until enough has been typed', async () => {
    const { type, suggest, el } = await render();

    await type('Ko');

    expect(suggest).not.toHaveBeenCalled();
    expect(el.querySelector('[role="listbox"]')).toBeNull();
  });

  it('offers what the provider answers once the typing settles', async () => {
    const { type, el } = await render();

    await type('Kontor');

    expect(el.querySelectorAll('[role="option"]')).toHaveLength(1);
    expect(el.textContent).toContain('Kontor GmbH');
  });

  // What tells two rows apart when the names look alike.
  it('shows the number and the town under the name', async () => {
    const { type, el } = await render();

    await type('Kontor');

    expect(el.textContent).toContain('DE123456789 · Hamburg');
  });

  it('marks the part of the name the query matched', async () => {
    const { type, el } = await render();

    await type('Kontor');

    expect(
      [...el.querySelectorAll('[role="option"] mark')].map(
        (m) => m.textContent,
      ),
    ).toEqual(['Kontor']);
  });

  // The field takes either half of the pair as its query, so a customer who
  // typed a number is looking for it in the row.
  it('marks the number too, when that is what was typed', async () => {
    const { type, el } = await render();

    await type('DE123456789');

    expect(
      [...el.querySelectorAll('[role="option"] mark')].map(
        (m) => m.textContent,
      ),
    ).toEqual(['DE123456789']);
  });

  it('emits the whole party, which is what fills both fields', async () => {
    const { type, el, picked } = await render();

    await type('Kontor');
    el.querySelector<HTMLElement>('[role="option"]')?.dispatchEvent(
      new MouseEvent('mousedown', { bubbles: true }),
    );

    expect(picked).toEqual([kontor]);
  });

  it('says so when the provider knows nothing, rather than showing an empty box', async () => {
    answers = [];
    const { type, el } = await render();

    await type('Kontor');

    expect(el.textContent).toContain(text.noSuggestions);
    expect(el.querySelectorAll('[role="option"]')).toHaveLength(0);
  });

  // A suggestion is an accelerator, never a step: a failed request leaves the
  // customer typing rather than taking the form with it.
  it('keeps the field usable when the request fails outright', async () => {
    rejects = true;
    const { type, input, el } = await render();

    await type('Kontor GmbH');

    expect(input.value).toBe('Kontor GmbH');
    expect(el.querySelectorAll('[role="option"]')).toHaveLength(0);
  });

  // The field shares a row with the other company field, so its own column is
  // too narrow to read a suggestion in — the panel has to escape it.
  it('draws a panel wider than a narrow column', async () => {
    const { type, el } = await render();

    await type('Kontor');

    const panel = el.querySelector('[role="listbox"]')?.parentElement;
    expect(panel?.className).toContain('min-w-[20rem]');
  });
});
