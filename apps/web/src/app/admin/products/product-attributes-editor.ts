import {
  CdkDrag,
  CdkDragDrop,
  CdkDragHandle,
  CdkDragPreview,
  CdkDropList,
  moveItemInArray,
} from '@angular/cdk/drag-drop';
import {
  Component,
  ElementRef,
  HostListener,
  afterRenderEffect,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import {
  PRODUCT_ATTRIBUTES_MAX,
  ProductAttribute,
} from '@b2b-catalog-platform/shared';
import { ADMIN_TEXT } from '../../config/admin-text';
import { LucideIcon } from '../../ui/icons/lucide-icon';
import { FieldLabel } from '../../ui/field-label';
import {
  applyPastedGrid,
  clearRange,
  GridCell,
  GridRange,
  parseClipboardGrid,
  selectionToTsv,
} from './attribute-grid';

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
  imports: [
    LucideIcon,
    CdkDropList,
    CdkDrag,
    CdkDragHandle,
    CdkDragPreview,
    FieldLabel,
  ],
  template: `
    <fieldset>
      <legend appFieldLabel>{{ text.heading }}</legend>

      <table class="w-full max-w-2xl border-collapse text-sm">
        <thead>
          <tr class="text-left text-subtle">
            <th class="w-1/3 pb-1 font-medium">{{ text.key }}</th>
            <th class="pb-1 font-medium">{{ text.value }}</th>
            <th class="w-24"></th>
          </tr>
        </thead>
        <tbody
          #grid
          cdkDropList
          contenteditable="true"
          class="focus:outline-none"
          (cdkDropListDropped)="onDrop($event)"
          (input)="onInput()"
          (copy)="onCopy($event)"
          (paste)="onPaste($event)"
          (keydown)="onKeydown($event)"
        >
          @for (row of rows(); track $index) {
            <tr cdkDrag [cdkDragData]="row">
              <!-- A detached table row collapses (loses cell widths), so the
                   floating drag preview is a plain labelled chip instead. -->
              <div
                *cdkDragPreview
                class="rounded-md border border-border-strong bg-white px-3 py-1.5 text-sm shadow-md"
              >
                {{ row.key || text.key }}
              </div>
              <td
                [attr.data-row]="$index"
                data-col="0"
                class="h-10 border border-border-strong bg-white px-2 py-1.5 align-center"
                [class]="cellFocus($index, 0)"
              ></td>
              <td
                [attr.data-row]="$index"
                data-col="1"
                class="h-10 border border-border-strong bg-white px-2 py-1.5 align-center"
                [class]="cellFocus($index, 1)"
              ></td>
              <td
                contenteditable="false"
                class="w-32 border-0 pl-2 align-middle"
              >
                <div class="flex items-center justify-center gap-1">
                  <button
                    type="button"
                    cdkDragHandle
                    class="cursor-grab p-1 text-stone-300 hover:text-subtle active:cursor-grabbing"
                    [attr.aria-label]="common.reorder"
                  >
                    <app-lucide-icon name="grip-vertical" class="h-5 w-5" />
                  </button>
                  <button
                    type="button"
                    class="p-1 text-stone-400 hover:text-accent"
                    [attr.aria-label]="text.add"
                    (click)="addBelow($index)"
                  >
                    <app-lucide-icon name="plus" class="h-5 w-5" />
                  </button>
                  <button
                    type="button"
                    class="p-1 text-stone-400 hover:text-red-700"
                    [attr.aria-label]="common.remove"
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
  protected readonly common = inject(ADMIN_TEXT).common;
  protected readonly text = inject(ADMIN_TEXT).productEditor.attributes;
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

  /**
   * The cell the caret sits in, as "row:col". The grid is a single
   * contenteditable region, so no individual cell ever takes DOM focus and
   * `:focus` cannot reach one — the selection is the only signal for which cell
   * is being edited, and without it the grid is the one control in the app that
   * shows nothing on focus.
   */
  private readonly activeCell = signal<string | null>(null);

  @HostListener('document:selectionchange')
  protected onSelectionChange(): void {
    const tbody = this.grid()?.nativeElement;
    const anchor = document.getSelection()?.anchorNode;
    if (!tbody || !anchor || !tbody.contains(anchor)) {
      this.activeCell.set(null);
      return;
    }
    const element =
      anchor instanceof Element ? anchor : (anchor.parentElement ?? null);
    const cell = element?.closest('td[data-col]');
    this.activeCell.set(
      cell
        ? `${cell.getAttribute('data-row')}:${cell.getAttribute('data-col')}`
        : null,
    );
  }

  /** Matches the focus outline of a normal input, drawn inside the cell's own
   * border so it never overlaps its neighbours. */
  protected cellFocus(row: number, col: number): string {
    return this.activeCell() === `${row}:${col}`
      ? 'outline-2 -outline-offset-2 outline-primary'
      : '';
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

  protected onDrop(event: CdkDragDrop<ProductAttribute[]>): void {
    if (event.previousIndex === event.currentIndex) return;
    // Blur first so the grid re-renders cell text from the reordered model
    // rather than from the DOM order CDK left behind.
    this.grid()?.nativeElement.blur();
    const rows = this.current();
    moveItemInArray(rows, event.previousIndex, event.currentIndex);
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
    event.clipboardData?.setData(
      'text/plain',
      selectionToTsv(this.current(), range),
    );
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

    const grid = parseClipboardGrid(text);
    this.valueChange.emit(
      applyPastedGrid(this.current(), start, grid, PRODUCT_ATTRIBUTES_MAX),
    );
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
  private cellOf(node: Node | null): GridCell | null {
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
  private selectedRange(): GridRange | null {
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

  private clearRange(range: GridRange): void {
    this.grid()?.nativeElement.blur();
    this.valueChange.emit(clearRange(this.current(), range));
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
