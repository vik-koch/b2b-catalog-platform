import {
  Component,
  ElementRef,
  afterRenderEffect,
  computed,
  inject,
  input,
  output,
  viewChild,
} from '@angular/core';
import {
  PRODUCT_ATTRIBUTES_MAX,
  ProductAttribute,
} from '@b2b-catalog-platform/shared';
import { APP_TEXT } from '../config/app-text';
import { LucideIcon } from '../ui/icons/lucide-icon';

interface CellCoord {
  row: number;
  col: 0 | 1;
}

/**
 * The product's custom-attribute table (FR-CAT-05) as a spreadsheet-like grid.
 *
 * `contenteditable` sits on the `<tbody>` — a single editing host — so a mouse
 * selection spans cells and Ctrl+C copies the rectangle as TSV natively, exactly
 * like Excel; pasting a TSV block fills outward from the target cell, and
 * selecting a range + Delete clears it. There are no copy/paste buttons: the
 * table itself is the clipboard surface.
 *
 * Angular owns the row/cell *structure* (via `@for`) but not the cell *text*: the
 * text is written to the DOM from the model only while the grid is not focused,
 * and read back on input — so typing is never overwritten mid-caret. Structural
 * keys that a contenteditable would otherwise use to merge/delete cells (Enter,
 * and Backspace/Delete at a cell boundary) are intercepted, so the table shape
 * the framework rendered can never be corrupted from inside the editable region.
 */
@Component({
  selector: 'app-product-attributes-editor',
  imports: [LucideIcon],
  template: `
    <fieldset>
      <legend class="mb-1 block text-sm font-medium">{{ text.heading }}</legend>

      <table class="w-full max-w-2xl border-collapse text-sm">
        <thead>
          <tr class="text-left text-stone-500">
            <th class="w-1/3 pb-1 font-medium">{{ text.key }}</th>
            <th class="pb-1 font-medium">{{ text.value }}</th>
            <th class="w-24"></th>
          </tr>
        </thead>
        <tbody
          #grid
          contenteditable="true"
          class="focus:outline-none"
          (input)="onInput()"
          (copy)="onCopy($event)"
          (paste)="onPaste($event)"
          (keydown)="onKeydown($event)"
        >
          @for (row of rows(); track $index) {
            <tr>
              <td
                [attr.data-row]="$index"
                data-col="0"
                class="h-10 border border-stone-300 px-2 py-1.5 align-top"
              ></td>
              <td
                [attr.data-row]="$index"
                data-col="1"
                class="h-10 border border-stone-300 px-2 py-1.5 align-top"
              ></td>
              <td
                contenteditable="false"
                class="w-32 border-0 pl-2 align-middle"
              >
                <div class="flex items-center justify-center gap-1">
                  <button
                    type="button"
                    class="p-1 text-stone-400 hover:text-ink disabled:opacity-30"
                    [attr.aria-label]="text.moveUp"
                    [disabled]="$index === 0"
                    (click)="move($index, -1)"
                  >
                    <app-lucide-icon name="chevron-up" class="h-5 w-5" />
                  </button>
                  <button
                    type="button"
                    class="p-1 text-stone-400 hover:text-ink disabled:opacity-30"
                    [attr.aria-label]="text.moveDown"
                    [disabled]="$index === rows().length - 1"
                    (click)="move($index, 1)"
                  >
                    <app-lucide-icon name="chevron-down" class="h-5 w-5" />
                  </button>
                  <button
                    type="button"
                    class="p-1 text-stone-400 hover:text-primary"
                    [attr.aria-label]="text.add"
                    (click)="addBelow($index)"
                  >
                    <app-lucide-icon name="plus" class="h-5 w-5" />
                  </button>
                  <button
                    type="button"
                    class="p-1 text-stone-400 hover:text-red-700"
                    [attr.aria-label]="text.remove"
                    (click)="remove($index)"
                  >
                    <app-lucide-icon name="trash-2" class="h-5 w-5" />
                  </button>
                </div>
              </td>
            </tr>
          }
        </tbody>
      </table>
    </fieldset>
  `,
})
export class ProductAttributesEditor {
  protected readonly text = inject(APP_TEXT).productEditor.attributes;
  private readonly grid =
    viewChild<ElementRef<HTMLTableSectionElement>>('grid');

  readonly value = input.required<ProductAttribute[]>();
  readonly valueChange = output<ProductAttribute[]>();

  /** Always render at least one (empty) row so the table is never empty. */
  protected readonly rows = computed<ProductAttribute[]>(() =>
    this.value().length > 0 ? this.value() : [{ key: '', value: '' }],
  );

  constructor() {
    // Model → DOM: fill each cell from the model, but never while the grid is
    // being edited (that would fight the caret). Reacts to row changes.
    afterRenderEffect(() => {
      const data = this.rows();
      const tbody = this.grid()?.nativeElement;
      if (!tbody || this.isEditing(tbody)) return;
      const trs = tbody.querySelectorAll('tr');
      data.forEach((row, i) => {
        const tr = trs[i];
        if (!tr) return;
        this.writeCell(tr, 0, row.key);
        this.writeCell(tr, 1, row.value);
      });
    });
  }

  // --- Row actions ---------------------------------------------------------

  /** Insert a new empty row directly below the given one. */
  protected addBelow(index: number): void {
    const rows = this.current();
    rows.splice(index + 1, 0, { key: '', value: '' });
    this.valueChange.emit(rows);
  }

  protected remove(index: number): void {
    this.valueChange.emit(this.current().filter((_, i) => i !== index));
  }

  protected move(index: number, direction: -1 | 1): void {
    const rows = this.current();
    const target = index + direction;
    if (target < 0 || target >= rows.length) return;
    [rows[index], rows[target]] = [rows[target], rows[index]];
    this.valueChange.emit(rows);
  }

  // --- Grid editing --------------------------------------------------------

  /** Read every cell back from the DOM after a keystroke. */
  protected onInput(): void {
    const tbody = this.grid()?.nativeElement;
    if (!tbody) return;
    const rows: ProductAttribute[] = [];
    tbody.querySelectorAll('tr').forEach((tr) => {
      rows.push({
        key: this.readCell(tr, 0),
        value: this.readCell(tr, 1),
      });
    });
    this.valueChange.emit(rows);
  }

  /**
   * Copy a multi-cell selection as clean TSV. The browser's native copy of a
   * contenteditable table serialises block breaks (stray blank lines that break
   * a paste into Excel or back here), so we build the TSV ourselves from the
   * selected rectangle. A selection within a single cell falls through to the
   * normal text copy.
   */
  protected onCopy(event: ClipboardEvent): void {
    const range = this.selectedRange();
    if (!range) return;
    const rows = this.current();
    const lines: string[] = [];
    for (let r = range.r0; r <= range.r1 && r < rows.length; r++) {
      const cols: string[] = [];
      if (range.c0 <= 0 && range.c1 >= 0) cols.push(rows[r].key);
      if (range.c0 <= 1 && range.c1 >= 1) cols.push(rows[r].value);
      lines.push(cols.join('\t'));
    }
    event.clipboardData?.setData('text/plain', lines.join('\n'));
    event.preventDefault();
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      event.preventDefault(); // cells are single-line
      return;
    }
    if (event.key !== 'Backspace' && event.key !== 'Delete') return;

    // A multi-cell selection + Delete/Backspace clears those cells (Excel-style)
    // rather than letting contenteditable merge them.
    const range = this.selectedRange();
    if (range) {
      event.preventDefault();
      this.clearRange(range);
      return;
    }
    // A collapsed caret at a cell boundary would otherwise merge into the
    // neighbouring cell — block it so the structure stays intact.
    if (this.atBoundary(event.key)) {
      event.preventDefault();
    }
  }

  /**
   * Spreadsheet paste: a value with no tab/newline falls through to the normal
   * cell paste; a grid fills outward from the target cell, adding rows up to the
   * cap. Blurs first so the edited cells re-render from the new model.
   */
  protected onPaste(event: ClipboardEvent): void {
    const text = event.clipboardData?.getData('text/plain') ?? '';
    if (!/[\t\n\r]/.test(text)) return;

    const start = this.cellOf(document.getSelection()?.anchorNode ?? null);
    if (!start) return;

    event.preventDefault();
    this.grid()?.nativeElement.blur();

    const grid = text
      .replace(/\r\n?/g, '\n')
      .replace(/\n$/, '')
      .split('\n')
      .map((line) => line.split('\t'))
      // Drop wholly-empty lines: copying contenteditable cells serialises blank
      // lines between rows, which would otherwise become stray empty rows.
      .filter((cols) => cols.some((c) => c.trim() !== ''));

    const rows = this.current();
    grid.forEach((cols, i) => {
      const r = start.row + i;
      while (rows.length <= r && rows.length < PRODUCT_ATTRIBUTES_MAX) {
        rows.push({ key: '', value: '' });
      }
      if (r >= rows.length) return;
      cols.forEach((val, j) => {
        const c = start.col + j;
        if (c === 0) rows[r] = { ...rows[r], key: val.trim() };
        else if (c === 1) rows[r] = { ...rows[r], value: val.trim() };
      });
    });
    this.valueChange.emit(rows);
  }

  // --- Helpers -------------------------------------------------------------

  private isEditing(tbody: HTMLElement): boolean {
    return typeof document !== 'undefined' && document.activeElement === tbody;
  }

  private writeCell(tr: Element, col: 0 | 1, value: string): void {
    const cell = tr.querySelector(`[data-col="${col}"]`);
    if (cell && cell.textContent !== value) cell.textContent = value;
  }

  private readCell(tr: Element, col: 0 | 1): string {
    return tr.querySelector(`[data-col="${col}"]`)?.textContent ?? '';
  }

  /** The data cell (row/col) a DOM node sits in, or null. */
  private cellOf(node: Node | null): CellCoord | null {
    const el =
      node?.nodeType === Node.TEXT_NODE
        ? node.parentElement
        : (node as Element | null);
    const cell = el?.closest<HTMLElement>('[data-col]');
    if (!cell) return null;
    return {
      row: Number(cell.dataset['row']),
      col: Number(cell.dataset['col']) as 0 | 1,
    };
  }

  /** The rectangle spanned by a non-collapsed selection across cells, or null. */
  private selectedRange(): {
    r0: number;
    c0: number;
    r1: number;
    c1: number;
  } | null {
    const sel = document.getSelection();
    if (!sel || sel.isCollapsed) return null;
    const a = this.cellOf(sel.anchorNode);
    const f = this.cellOf(sel.focusNode);
    if (!a || !f || (a.row === f.row && a.col === f.col)) return null;
    return {
      r0: Math.min(a.row, f.row),
      c0: Math.min(a.col, f.col),
      r1: Math.max(a.row, f.row),
      c1: Math.max(a.col, f.col),
    };
  }

  private clearRange(range: {
    r0: number;
    c0: number;
    r1: number;
    c1: number;
  }): void {
    const rows = this.current();
    for (let r = range.r0; r <= range.r1 && r < rows.length; r++) {
      const next = { ...rows[r] };
      if (range.c0 <= 0 && range.c1 >= 0) next.key = '';
      if (range.c0 <= 1 && range.c1 >= 1) next.value = '';
      rows[r] = next;
    }
    this.grid()?.nativeElement.blur();
    this.valueChange.emit(rows);
  }

  private atBoundary(key: string): boolean {
    const sel = document.getSelection();
    if (!sel || !sel.isCollapsed) return false;
    if (key === 'Backspace') return sel.anchorOffset === 0;
    const len =
      sel.anchorNode?.nodeType === Node.TEXT_NODE
        ? (sel.anchorNode.textContent?.length ?? 0)
        : 0;
    return sel.anchorOffset >= len;
  }

  /** A mutable copy of the current rows (materialising the phantom empty row). */
  private current(): ProductAttribute[] {
    return this.value().length > 0
      ? [...this.value()]
      : [{ key: '', value: '' }];
  }
}
