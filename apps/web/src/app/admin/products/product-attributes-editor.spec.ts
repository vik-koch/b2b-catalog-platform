import { TestBed } from '@angular/core/testing';
import { ProductAttribute } from '@b2b-catalog-platform/shared';
import { ADMIN_TEXT } from '../../config/admin-text';
import { defaultAdminText } from '../../config/admin-text.fixture';
import { ProductAttributesEditor } from './product-attributes-editor';

/**
 * The grid is one `contenteditable` region, so these drive it the way a browser
 * does — real events on the tbody — rather than calling methods.
 */
function render(rows: ProductAttribute[]) {
  TestBed.configureTestingModule({
    imports: [ProductAttributesEditor],
    providers: [{ provide: ADMIN_TEXT, useValue: defaultAdminText }],
  });
  const fixture = TestBed.createComponent(ProductAttributesEditor);
  fixture.componentRef.setInput('value', rows);
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

  it('handles paste itself, so no clipboard markup reaches the table', () => {
    const h = render(rows());
    caretIn(h.tbody.querySelector('[data-col="0"]') as HTMLElement);

    const paste = pasteOf('Process');
    h.tbody.dispatchEvent(paste);

    expect(paste.defaultPrevented).toBe(true);
  });
});
