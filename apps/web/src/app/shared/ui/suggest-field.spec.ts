import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { SuggestList } from './suggest-list';
import { SuggestField } from './suggest-field';
import { SuggestInput } from './suggest-input';
import { SuggestRow } from './suggest-row';

const text = {
  suggestionsAria: 'Suggestions',
  noSuggestions: 'Nothing matches.',
  suggestionCountAria: '{count} suggestions',
};

/** What the stubbed source answers with; set per test. */
let answers: string[] = [];

@Component({
  imports: [SuggestField, SuggestInput, SuggestRow],
  template: `
    <form (submit)="$event.preventDefault(); submitted = true">
      <app-suggest-field
        [list]="list"
        [text]="text"
        (picked)="picked.push($event)"
      >
        <input appSuggestInput />
        <ng-template appSuggestRow [of]="list" let-item let-query="query">
          <span>{{ item }}|{{ query }}</span>
        </ng-template>
      </app-suggest-field>
    </form>
  `,
})
class Host {
  readonly text = text;
  readonly picked: string[] = [];
  submitted = false;
  readonly list = new SuggestList<string>({
    load: async () => answers,
    minLength: 3,
  });
}

async function render() {
  const fixture = TestBed.createComponent(Host);
  await fixture.whenStable();
  const el = fixture.nativeElement as HTMLElement;
  const input = el.querySelector('input') as HTMLInputElement;

  const options = () => [
    ...el.querySelectorAll<HTMLElement>('[role="option"]'),
  ];
  const active = () => input.getAttribute('aria-activedescendant');
  const optionId = (i: number) => options()[i].id;

  return {
    fixture,
    el,
    input,
    options,
    active,
    optionId,
    /** Types, then waits out the debounce and the stubbed request. */
    type: async (value: string) => {
      input.value = value;
      input.dispatchEvent(new Event('input'));
      await new Promise((resolve) => setTimeout(resolve, 350));
      await fixture.whenStable();
      fixture.detectChanges();
    },
    press: (key: string) => {
      const event = new KeyboardEvent('keydown', { key, cancelable: true });
      input.dispatchEvent(event);
      fixture.detectChanges();
      return event;
    },
  };
}

describe('SuggestField', () => {
  beforeEach(() => {
    answers = ['Alpha', 'Beta', 'Gamma'];
  });

  it('wires the input as a combobox controlling the listbox', async () => {
    const { type, input, el } = await render();

    expect(input.getAttribute('role')).toBe('combobox');
    expect(input.getAttribute('aria-autocomplete')).toBe('list');
    expect(input.getAttribute('aria-expanded')).toBe('false');

    await type('alp');

    expect(input.getAttribute('aria-expanded')).toBe('true');
    expect(el.querySelector('[role="listbox"]')?.id).toBe(
      input.getAttribute('aria-controls'),
    );
  });

  it('draws each row from the caller’s template, with the settled query', async () => {
    const { type, options } = await render();

    await type('alp');

    expect(options().map((o) => o.textContent?.trim())).toEqual([
      'Alpha|alp',
      'Beta|alp',
      'Gamma|alp',
    ]);
  });

  // Enter belongs to the form until the person moves into the list.
  it('makes no row active until an arrow key', async () => {
    const { type, active, press } = await render();

    await type('alp');

    expect(active()).toBeNull();
    expect(press('Enter').defaultPrevented).toBe(false);
  });

  it('walks the rows with the arrows, through the typed text back again', async () => {
    const { type, active, press, optionId } = await render();
    await type('alp');

    press('ArrowDown');
    expect(active()).toBe(optionId(0));
    press('ArrowDown');
    press('ArrowDown');
    expect(active()).toBe(optionId(2));
    press('ArrowDown');
    expect(active()).toBeNull();
    press('ArrowUp');
    expect(active()).toBe(optionId(2));
  });

  it('moves to the first and last row with Home and End once in the list', async () => {
    const { type, active, press, optionId } = await render();
    await type('alp');

    // While typing they move the caret, and stay the input's.
    expect(press('End').defaultPrevented).toBe(false);
    expect(active()).toBeNull();

    press('ArrowDown');
    expect(press('End').defaultPrevented).toBe(true);
    expect(active()).toBe(optionId(2));
    press('Home');
    expect(active()).toBe(optionId(0));
  });

  it('picks the active row on Enter and closes the list', async () => {
    const { fixture, type, press, el } = await render();
    await type('alp');

    press('ArrowDown');
    press('ArrowDown');
    const enter = press('Enter');

    expect(enter.defaultPrevented).toBe(true);
    expect(fixture.componentInstance.picked).toEqual(['Beta']);
    expect(el.querySelector('[role="listbox"]')).toBeNull();
  });

  it('closes on Escape without picking', async () => {
    const { fixture, type, press, input } = await render();
    await type('alp');

    press('ArrowDown');
    press('Escape');

    expect(input.getAttribute('aria-expanded')).toBe('false');
    expect(fixture.componentInstance.picked).toEqual([]);
  });

  // mousedown, and its default prevented: focus stays in the input, and the
  // blur that would close the list first never happens.
  it('picks a row by pointer without taking focus from the input', async () => {
    const { fixture, type, options } = await render();
    await type('alp');

    const down = new MouseEvent('mousedown', {
      bubbles: true,
      cancelable: true,
    });
    options()[2].dispatchEvent(down);

    expect(down.defaultPrevented).toBe(true);
    expect(fixture.componentInstance.picked).toEqual(['Gamma']);
  });

  it('points at the row under the pointer', async () => {
    const { type, options, active, optionId, fixture } = await render();
    await type('alp');

    options()[1].dispatchEvent(new MouseEvent('mouseenter'));
    fixture.detectChanges();

    expect(active()).toBe(optionId(1));
    expect(options()[1].getAttribute('aria-selected')).toBe('true');
  });

  it('closes when the input is left', async () => {
    const { type, input, fixture } = await render();
    await type('alp');

    input.dispatchEvent(new Event('blur'));
    fixture.detectChanges();

    expect(input.getAttribute('aria-expanded')).toBe('false');
  });

  it('says how many rows there are, or that there are none', async () => {
    const { type, el } = await render();
    const live = () => el.querySelector('[aria-live]')?.textContent?.trim();

    await type('alp');
    expect(live()).toBe('3 suggestions');

    answers = [];
    await type('alph');
    expect(live()).toBe('Nothing matches.');
    expect(el.textContent).toContain('Nothing matches.');
  });

  it('gives two fields on one page their own list ids', async () => {
    const one = await render();
    const two = await render();

    expect(one.input.getAttribute('aria-controls')).not.toBe(
      two.input.getAttribute('aria-controls'),
    );
  });
});
