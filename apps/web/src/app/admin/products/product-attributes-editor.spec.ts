import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import {
  AttributeDefinition,
  AttributeKeyUsage,
  ProductAttribute,
} from '@b2b-catalog-platform/shared';
import { ADMIN_TEXT } from '../../config/admin-text';
import { defaultAdminText } from '../../config/admin-text.fixture';
import { ProductAttributesEditor } from './product-attributes-editor';

/**
 * The grid is one `contenteditable` region, so these drive it the way a browser
 * does — real events on the tbody — rather than calling methods.
 */
function render(
  rows: ProductAttribute[],
  catalog: {
    keys?: AttributeKeyUsage[];
    definitions?: AttributeDefinition[];
    ownKeys?: string[];
  } = {},
) {
  TestBed.configureTestingModule({
    imports: [ProductAttributesEditor],
    providers: [
      provideRouter([]),
      { provide: ADMIN_TEXT, useValue: defaultAdminText },
    ],
  });
  const fixture = TestBed.createComponent(ProductAttributesEditor);
  fixture.componentRef.setInput('value', rows);
  fixture.componentRef.setInput('knownKeys', catalog.keys ?? []);
  fixture.componentRef.setInput('definitions', catalog.definitions ?? []);
  fixture.componentRef.setInput('ownKeys', catalog.ownKeys ?? []);
  const emitted: ProductAttribute[][] = [];
  fixture.componentInstance.valueChange.subscribe((v) => {
    emitted.push(v);
    // Behave like the host: the input is the emitted value.
    fixture.componentRef.setInput('value', v);
  });
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  return {
    fixture,
    el,
    emitted,
    tbody: el.querySelector('tbody') as HTMLElement,
    /** The action buttons of a body row: grip, ＋, bin — in that order. */
    actions: (row = 0) =>
      el.querySelectorAll('tbody tr')[row].querySelectorAll('button'),
    /** Every badge a row shows, by the remark it carries — the funnel over the
     * key cell first, then whatever marks the value cell. */
    marks: (row = 0) =>
      [
        ...el
          .querySelectorAll('tbody tr')
          [row].querySelectorAll('app-hint-badge [role="img"]'),
      ].map((badge) => badge.getAttribute('aria-label')),
    /** The declared unit shown over the value cell, if any. */
    unit: (row = 0) =>
      el
        .querySelectorAll('tbody tr')
        [row].querySelector('td:last-child > span')
        ?.textContent?.trim() ?? null,
    /** The live "who else carries this" link of a row, if it has one. */
    link: (row = 0) => el.querySelectorAll('tbody tr')[row].querySelector('a'),
    /** Its dead counterpart, kept in place when there is nothing to show. */
    deadLink: (row = 0) =>
      el
        .querySelectorAll('tbody tr')
        [row].querySelector('[aria-disabled="true"]'),
  };
}

const undo = (tbody: HTMLElement) =>
  tbody.dispatchEvent(
    new KeyboardEvent('keydown', {
      key: 'z',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    }),
  );

const redo = (tbody: HTMLElement) =>
  tbody.dispatchEvent(
    new KeyboardEvent('keydown', {
      key: 'z',
      ctrlKey: true,
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    }),
  );

/** Select a cell's whole text, the way a double-click does. */
function selectCell(cell: HTMLElement) {
  const range = document.createRange();
  range.selectNodeContents(cell);
  const selection = document.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

/** Select from one cell into another, the way a drag out of a cell does. */
function selectAcross(from: HTMLElement, to: HTMLElement) {
  const range = document.createRange();
  range.setStart(from, 0);
  range.setEnd(to, to.childNodes.length);
  const selection = document.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

/** Put the caret at the end of a cell, the way a click does. */
function caretIn(cell: HTMLElement) {
  const range = document.createRange();
  range.selectNodeContents(cell);
  range.collapse(false);
  const selection = document.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

/** jsdom has no DataTransfer, so the payload is stubbed onto the event. */
function pasteOf(text: string): Event {
  const paste = new Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(paste, 'clipboardData', {
    value: { getData: () => text },
  });
  return paste;
}

const cellText = (tbody: HTMLElement) =>
  [...tbody.querySelectorAll('tr')].map((tr) =>
    [...tr.querySelectorAll('[data-col]')].map((td) => td.textContent),
  );

const rows = (): ProductAttribute[] => [
  { key: 'Origin', value: 'Honduras' },
  { key: 'Roast', value: 'Dark' },
];

describe('ProductAttributesEditor undo', () => {
  it('puts back a removed row', () => {
    const h = render(rows());

    // The bin is the last button in the row's action cell.
    const actions = h.actions(0);
    actions[actions.length - 1].click();
    expect(h.emitted.at(-1)).toEqual([{ key: 'Roast', value: 'Dark' }]);

    undo(h.tbody);

    expect(h.emitted.at(-1)).toEqual(rows());
  });

  it('puts back an added row', () => {
    const h = render(rows());

    const actions = h.actions(0);
    actions[actions.length - 2].click(); // the ＋
    expect(h.emitted.at(-1)).toHaveLength(3);

    undo(h.tbody);

    expect(h.emitted.at(-1)).toEqual(rows());
  });

  it('reverses a paste, so the pasted content goes away', () => {
    const h = render(rows());
    // The caret sits in the first cell, which is where a paste lands.
    caretIn(h.tbody.querySelector('[data-col="0"]') as HTMLElement);

    h.tbody.dispatchEvent(pasteOf('Process\tWashed\nBags\t6'));
    expect(h.emitted.at(-1)?.[0]).toEqual({ key: 'Process', value: 'Washed' });

    undo(h.tbody);

    expect(h.emitted.at(-1)).toEqual(rows());
  });

  it('redoes what it undid', () => {
    const h = render(rows());
    const actions = h.actions(0);
    actions[actions.length - 1].click();
    undo(h.tbody);

    redo(h.tbody);

    expect(h.emitted.at(-1)).toEqual([{ key: 'Roast', value: 'Dark' }]);
  });

  it('puts back typed text', () => {
    const h = render(rows());
    const cell = h.tbody.querySelector('[data-col="1"]') as HTMLElement;
    caretIn(cell);

    cell.textContent = 'Peru';
    h.tbody.dispatchEvent(new Event('input', { bubbles: true }));
    expect(h.emitted.at(-1)?.[0]).toEqual({ key: 'Origin', value: 'Peru' });

    undo(h.tbody);

    expect(h.emitted.at(-1)).toEqual(rows());
  });

  it('undoes a drag-and-drop reorder, the first press', () => {
    // A drag leaves nothing in the grid focused of its own accord, and the
    // shortcut is the grid's. The focus assertion is the one that carries the
    // regression: a dispatched keydown reaches the handler either way, where a
    // real Ctrl+Z would have gone to the browser instead.
    const h = render(rows());

    // The CDK's own event: a real drag cannot be dispatched in jsdom.
    (
      h.fixture.componentInstance as unknown as {
        onDrop(event: { previousIndex: number; currentIndex: number }): void;
      }
    ).onDrop({ previousIndex: 1, currentIndex: 0 });
    h.fixture.detectChanges();
    expect(h.emitted.at(-1)).toEqual([rows()[1], rows()[0]]);
    expect(document.activeElement).toBe(h.tbody);

    undo(h.tbody);

    expect(h.emitted.at(-1)).toEqual(rows());
  });

  it('leaves the caret in the grid after a removal, so Ctrl+Z is reachable', () => {
    // The clicked button goes away with its row; without this the focus falls
    // to the body and the shortcut never reaches the grid.
    const h = render(rows());

    const actions = h.actions(0);
    actions[actions.length - 1].click();
    h.fixture.detectChanges();

    expect(document.activeElement).toBe(h.tbody);
  });

  it('does nothing when there is nothing to undo', () => {
    const h = render(rows());

    undo(h.tbody);

    expect(h.emitted).toEqual([]);
  });
});

describe('ProductAttributesEditor grid', () => {
  it('re-renders the remaining rows after a removal, caret or not', () => {
    const h = render(rows());
    // The caret staying in the grid must not stop the cells being rewritten:
    // the rows shift up, and stale text would look like the wrong row went.
    caretIn(h.tbody.querySelector('[data-col="0"]') as HTMLElement);

    const actions = h.actions(0);
    actions[actions.length - 1].click();
    h.fixture.detectChanges();

    expect(cellText(h.tbody)).toEqual([['Roast', 'Dark']]);
  });

  it('pastes a plain value over the selection inside one cell', () => {
    const h = render(rows());
    selectCell(h.tbody.querySelector('[data-col="1"]') as HTMLElement);

    h.tbody.dispatchEvent(pasteOf('Peru'));

    expect(h.emitted.at(-1)?.[0]).toEqual({ key: 'Origin', value: 'Peru' });
  });

  it('pastes a plain value in at the caret', () => {
    const h = render(rows());
    caretIn(h.tbody.querySelector('[data-col="1"]') as HTMLElement);

    h.tbody.dispatchEvent(pasteOf('!'));

    expect(h.emitted.at(-1)?.[0]).toEqual({
      key: 'Origin',
      value: 'Honduras!',
    });
  });

  it('pastes into the cell the selection began in, not the key column', () => {
    // Dragging over a value-column cell and out of it makes the browser select
    // whole cells, key column included — the paste still belongs to the value.
    const h = render(rows());
    const key = h.tbody.querySelector('[data-col="0"]') as HTMLElement;
    const value = h.tbody.querySelector('[data-col="1"]') as HTMLElement;
    value.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    selectAcross(key, value);

    h.tbody.dispatchEvent(pasteOf('Peru'));

    expect(h.emitted.at(-1)?.[0]).toEqual({ key: 'Origin', value: 'Peru' });
  });

  it('leaves the rest of a multi-cell selection alone', () => {
    const h = render(rows());
    const first = h.tbody.querySelector('[data-col="0"]') as HTMLElement;
    const last = h.tbody.querySelectorAll('[data-col="1"]')[1] as HTMLElement;
    first.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    selectAcross(first, last);

    h.tbody.dispatchEvent(pasteOf('Process'));

    // Only the target cell is overwritten; a paste is not a clear.
    expect(h.emitted.at(-1)).toEqual([
      { key: 'Process', value: 'Honduras' },
      { key: 'Roast', value: 'Dark' },
    ]);
  });

  it('types into the cell the selection began in, not the key column', () => {
    // A drag that leaves its cell stops being a text selection: the browser
    // grows it over whole cells, key column included. The character belongs to
    // the value the user was pointing at.
    const h = render(rows());
    const key = h.tbody.querySelector('[data-col="0"]') as HTMLElement;
    const value = h.tbody.querySelector('[data-col="1"]') as HTMLElement;
    value.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    selectAcross(key, value);

    const typed = new KeyboardEvent('keydown', {
      key: 'P',
      bubbles: true,
      cancelable: true,
    });
    h.tbody.dispatchEvent(typed);

    expect(typed.defaultPrevented).toBe(true);
    // The cell is replaced, spreadsheet-style, and its neighbour is untouched.
    expect(h.emitted.at(-1)).toEqual([
      { key: 'Origin', value: 'P' },
      { key: 'Roast', value: 'Dark' },
    ]);
  });

  it('leaves ordinary typing inside one cell to the browser', () => {
    const h = render(rows());
    caretIn(h.tbody.querySelector('[data-col="1"]') as HTMLElement);

    const typed = new KeyboardEvent('keydown', {
      key: 'x',
      bubbles: true,
      cancelable: true,
    });
    h.tbody.dispatchEvent(typed);

    expect(typed.defaultPrevented).toBe(false);
  });

  it('handles paste itself, so no clipboard markup reaches the table', () => {
    const h = render(rows());
    caretIn(h.tbody.querySelector('[data-col="0"]') as HTMLElement);

    const paste = pasteOf('Process');
    h.tbody.dispatchEvent(paste);

    expect(paste.defaultPrevented).toBe(true);
  });
});

const text = defaultAdminText.productEditor.attributes;

const known = (key: string, productCount = 3): AttributeKeyUsage => ({
  key,
  productCount,
  valueCount: 2,
  definition: null,
});

const declared = (
  name: string,
  type: 'text' | 'number' = 'text',
): AttributeDefinition => ({
  id: `def-${name}`,
  name,
  slug: name.toLowerCase(),
  type,
  unit: null,
  sortOrder: 0,
  productCount: 1,
  valueCount: 1,
  unparsedCount: 0,
  updatedAt: '2026-08-19T10:00:00.000Z',
});

describe('ProductAttributesEditor row badges', () => {
  it('says nothing about a key the catalog already carries', () => {
    const h = render(rows(), { keys: [known('Origin'), known('Roast')] });

    expect(h.marks(0)).toEqual([]);
  });

  it('says a key nothing else carries through the dead link, not a badge', () => {
    const h = render([{ key: 'Lenght', value: '30' }], {
      keys: [known('Length')],
    });

    // No badge: only what the shop does with a row earns one.
    expect(h.marks(0)).toEqual([]);
    expect(h.link(0)).toBeNull();
    expect(h.deadLink(0)?.getAttribute('title')).toBe(text.unknownKey);
  });

  it('keeps the link in place, dead, so the row actions never shift', () => {
    const h = render([{ key: '', value: '' }], { keys: [known('Origin')] });

    expect(h.deadLink(0)?.getAttribute('title')).toBe(text.showUsage);
  });

  it('keeps marking a key only this product carries, once saved', () => {
    // The catalog now counts this very product under the typo; discounting it
    // is what keeps the badge from going quiet the moment it became permanent.
    const h = render([{ key: 'Lenght', value: '30' }], {
      keys: [known('Lenght', 1), known('Length')],
      ownKeys: ['Lenght'],
    });

    expect(h.marks(0)).toEqual([]);
    expect(h.link(0)).toBeNull();
    expect(h.deadLink(0)?.getAttribute('title')).toBe(text.unknownKey);
  });

  it('marks a declared key as filterable', () => {
    const h = render([{ key: 'Roast', value: 'Dark' }], {
      definitions: [declared('Roast')],
    });

    expect(h.marks(0)).toEqual([text.filterable]);
  });

  it('shows a number attribute’s unit beside the value it measures', () => {
    const h = render([{ key: 'Length', value: '30' }], {
      definitions: [{ ...declared('Length', 'number'), unit: 'cm' }],
    });

    // The unit belongs to the definition, never to the cell: the row still
    // holds "30".
    expect(h.unit(0)).toBe('cm');
    expect(h.marks(0)).toEqual([text.filterable]);
  });

  it('keeps the unit while the value is still empty', () => {
    const h = render([{ key: 'Length', value: '' }], {
      definitions: [{ ...declared('Length', 'number'), unit: 'cm' }],
    });

    expect(h.unit(0)).toBe('cm');
  });

  it('warns where a value drops out of a number attribute’s filter', () => {
    const h = render([{ key: 'Length', value: 'ca. 30' }], {
      definitions: [{ ...declared('Length', 'number'), unit: 'cm' }],
    });

    // The warning takes the unit's place; the key is still filterable.
    expect(h.unit(0)).toBeNull();
    expect(h.marks(0)).toEqual([text.filterable, text.notNumeric]);
  });

  it('links to the attribute in the inventory, in a new tab', () => {
    const h = render(rows(), { keys: [known('Origin')] });
    const link = h.link(0);

    expect(link?.getAttribute('target')).toBe('_blank');
    // The key, not the pair: what the link promises is what the enabled state
    // knows — that the catalog carries this name.
    expect(link?.getAttribute('href')).toBe(
      '/admin/attributes/inventory?key=Origin',
    );
  });

  it('links by the key alone while the row is half typed', () => {
    const h = render([{ key: ' Origin ', value: '' }], {
      keys: [known('Origin')],
    });

    expect(h.link(0)?.getAttribute('href')).toBe(
      '/admin/attributes/inventory?key=Origin',
    );
  });

  it('offers no live link where there is nothing to show', () => {
    const h = render([{ key: 'Lenght', value: '30' }], {
      keys: [known('Length')],
    });

    expect(h.link(0)).toBeNull();
    expect(h.deadLink(0)).not.toBeNull();
  });
});

describe('ProductAttributesEditor key picker', () => {
  /** Opens the picker and returns its checkbox rows. */
  function open(h: ReturnType<typeof render>) {
    const picker = h.el.querySelector(
      'app-attribute-key-picker',
    ) as HTMLElement;
    (picker.querySelector('button') as HTMLButtonElement).click();
    h.fixture.detectChanges();
    return {
      picker,
      labels: [...picker.querySelectorAll('label')],
      apply: () => {
        const buttons = [...picker.querySelectorAll('button')];
        (buttons[buttons.length - 1] as HTMLButtonElement).click();
        h.fixture.detectChanges();
      },
    };
  }

  function check(label: HTMLElement, fixture: { detectChanges(): void }) {
    const box = label.querySelector('input') as HTMLInputElement;
    box.checked = true;
    box.dispatchEvent(new Event('change'));
    fixture.detectChanges();
  }

  it('lists every known name, declared or not, alphabetically', () => {
    const h = render([{ key: '', value: '' }], {
      keys: [known('Roast'), known('Origin')],
      definitions: [declared('Colour')],
    });

    const { labels } = open(h);

    expect(labels.map((l) => l.textContent?.trim().split(/\s+/)[0])).toEqual([
      'Colour',
      'Origin',
      'Roast',
    ]);
  });

  it('offers a name the table already holds, but not twice', () => {
    const h = render(rows(), { keys: [known('Origin')] });

    const { labels } = open(h);

    expect(labels[0].querySelector('input')?.disabled).toBe(true);
    expect(labels[0].textContent).toContain(text.inTable);
  });

  it('appends one empty row per checked name, filling an empty grid', () => {
    const h = render([], {
      keys: [known('Origin')],
      definitions: [declared('Colour')],
    });

    const picker = open(h);
    check(picker.labels[0], h.fixture); // Colour
    check(picker.labels[1], h.fixture); // Origin
    picker.apply();

    // The phantom empty row an empty grid renders is not left above them.
    expect(h.emitted.at(-1)).toEqual([
      { key: 'Colour', value: '' },
      { key: 'Origin', value: '' },
    ]);
  });

  it('drops a checked name once the grid holds it, so it is not added twice', () => {
    const h = render([], { definitions: [declared('Colour')] });

    const picker = open(h);
    check(picker.labels[0], h.fixture);
    // The admin types the same name into a cell while the panel is open.
    h.fixture.componentRef.setInput('value', [{ key: 'Colour', value: '' }]);
    h.fixture.detectChanges();

    const buttons = [...picker.picker.querySelectorAll('button')];
    const apply = buttons[buttons.length - 1] as HTMLButtonElement;
    expect(apply.disabled).toBe(true);
    expect(apply.textContent).toContain('0');
  });

  it('adds below what the product already carries, and undoes in one step', () => {
    const h = render(rows(), { definitions: [declared('Colour')] });

    const picker = open(h);
    check(picker.labels[0], h.fixture);
    picker.apply();
    expect(h.emitted.at(-1)).toEqual([...rows(), { key: 'Colour', value: '' }]);

    undo(h.tbody);

    expect(h.emitted.at(-1)).toEqual(rows());
  });
});
