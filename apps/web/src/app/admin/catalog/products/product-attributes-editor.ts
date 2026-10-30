import {
  CdkDrag,
  CdkDragDrop,
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
import { ProductAttribute } from '@b2b-catalog-platform/shared/core/catalog';
import { fillText } from '@b2b-catalog-platform/shared';
import {
  AttributeDefinition,
  AttributeKeyUsage,
  PRODUCT_ATTRIBUTES_MAX,
} from '@b2b-catalog-platform/shared/admin/catalog';
import { ADMIN_TEXT } from '../../../shared/config/admin-text';
import { injectNarrowScreen } from '@b2b-catalog-platform/ui/core/narrow-screen';
import { IconButton } from '@b2b-catalog-platform/ui/actions/icon-button';
import { Icon } from '@b2b-catalog-platform/ui/icons/icon';
import { HintBadge } from '@b2b-catalog-platform/ui/content/hint-badge';
import { FieldLabel } from '@b2b-catalog-platform/ui/fields/field-label';
import { TextButton } from '@b2b-catalog-platform/ui/actions/text-button';
import {
  AttributeHint,
  attributeHints,
  attributeRowMarks,
} from './attribute-hints';
import { AttributeKeyPicker } from './attribute-key-picker';
import { ProductAttributesNarrow } from './product-attributes-narrow';
import {
  applyPastedGrid,
  clearRange,
  GridCell,
  GridRange,
  parseClipboardGrid,
  selectionToTsv,
} from './attribute-grid';
import { SHARED_TEXT } from '../../../shared/config/shared-text';
import { funnelIcon } from '@b2b-catalog-platform/ui/icons/glyphs/funnel';
import { plusIcon } from '@b2b-catalog-platform/ui/icons/glyphs/plus';
import { trash2Icon } from '@b2b-catalog-platform/ui/icons/glyphs/trash-2';
import { triangleAlertIcon } from '@b2b-catalog-platform/ui/icons/glyphs/triangle-alert';
import { DragGrip } from '../ui/drag-grip';

/**
 * The product's attributes (FR-CAT-05) as a spreadsheet: `contenteditable` on
 * the `<tbody>`, one editing host, so a selection spans cells, copy writes
 * TSV, a paste fills outward and Delete clears a range.
 *
 * Angular owns the rows and cells, not their text: the text is written from
 * the model, skipping the cell under the caret, and read back on input. Enter,
 * Backspace and Delete at a cell boundary, and paste, are intercepted, so the
 * rendered structure cannot be broken from inside the editable region.
 */
@Component({
  selector: 'app-product-attributes-editor',
  imports: [
    DragGrip,
    Icon,
    IconButton,
    AttributeKeyPicker,
    ProductAttributesNarrow,
    HintBadge,
    CdkDropList,
    CdkDrag,
    CdkDragPreview,
    FieldLabel,
    TextButton,
  ],
  template: `
    <!-- A <fieldset> defaults to min-width:min-content, the table's width. -->
    <fieldset class="min-w-0">
      <legend uiFieldLabel>{{ text.heading }}</legend>

      @if (narrow()) {
        <app-product-attributes-narrow
          [value]="value()"
          [marks]="marks()"
          (valueChange)="valueChange.emit($event)"
        />
      } @else {
        <!-- Fixed layout, like the packaging grid: a long value grows the row,
             not the column, so the two tables stay lined up. -->
        <table class="w-full max-w-3xl table-fixed border-collapse text-sm">
          <thead>
            <tr class="text-left text-ink-subtle">
              <th class="w-1/3 pb-1 font-medium">{{ text.key }}</th>
              <th class="pb-1 font-medium">{{ text.value }}</th>
              <th class="w-48"></th>
            </tr>
          </thead>
          <tbody
            #grid
            cdkDropList
            contenteditable="true"
            class="focus:outline-none"
            (cdkDropListDropped)="onDrop($event)"
            (input)="onInput()"
            (mousedown)="onMouseDown($event)"
            (copy)="onCopy($event)"
            (paste)="onPaste($event)"
            (keydown)="onKeydown($event)"
          >
            @for (row of rows(); track $index) {
              @let mark = marks()[$index];
              <!-- The badges are rendered from the action cell, the only part
                   outside the editable region, and placed against the row:
                   the column edges are fractions of a fixed-layout table. -->
              <tr cdkDrag [cdkDragData]="row" class="relative">
                <!-- A detached row loses its cell widths, so the preview is a
                     chip. -->
                <div
                  *cdkDragPreview
                  class="rounded-md border border-edge-strong bg-white px-3
                         py-1.5 text-sm shadow-md"
                >
                  {{ row.key || text.key }}
                </div>
                <!-- An explicit line-height: an empty cell has a zero-height
                     line box, which puts the first caret at the top. It must
                     fit the content box, or the first character grows the
                     row. pr-9 clears a badge over the cell. -->
                <td
                  [attr.data-row]="$index"
                  data-col="0"
                  class="h-10 border border-edge-strong bg-white px-2 py-1.5
                         leading-6 align-middle wrap-break-word"
                  [class]="
                    cellFocus($index, 0) +
                    (mark.filterable || mark.stray ? ' pr-9' : '')
                  "
                ></td>
                <td
                  [attr.data-row]="$index"
                  data-col="1"
                  class="h-10 border border-edge-strong bg-white px-2 py-1.5
                         leading-6 align-middle wrap-break-word"
                  [class]="
                    cellFocus($index, 1) +
                    (mark.notNumeric || mark.unit ? ' pr-9' : '')
                  "
                ></td>
                <td
                  contenteditable="false"
                  class="w-48 border-0 pl-3 align-middle select-none"
                >
                  <!-- In the funnel's place: why the row is not filterable. -->
                  @if (mark.stray; as stray) {
                    <ui-hint-badge
                      class="absolute top-1/2 right-2/3 mr-3 -translate-y-1/2"
                      tone="warning"
                      [label]="strayLabel(stray)"
                    >
                      <ui-icon [glyph]="triangleAlertIcon" class="size-3.5" />
                    </ui-hint-badge>
                  }
                  <!-- Over the key cell: it is the key the shop filters by. -->
                  @if (mark.filterable) {
                    <ui-hint-badge
                      class="absolute top-1/2 right-2/3 mr-3 -translate-y-1/2"
                      tone="neutral"
                      [label]="text.filterable"
                    >
                      <ui-icon [glyph]="funnelIcon" class="size-3.5" />
                    </ui-hint-badge>
                  }
                  @if (mark.notNumeric) {
                    <ui-hint-badge
                      class="absolute top-1/2 right-48 mr-3 -translate-y-1/2"
                      tone="warning"
                      [label]="text.notNumeric"
                    >
                      <ui-icon [glyph]="triangleAlertIcon" class="size-3.5" />
                    </ui-hint-badge>
                  } @else if (mark.unit) {
                    <!-- Never part of the value: the cell holds "1000", the
                         shop shows "1000 g". -->
                    <span
                      class="absolute top-1/2 right-48 mr-3 -translate-y-1/2
                             text-xs text-ink-subtle"
                      >{{ mark.unit }}</span
                    >
                  }
                  <div class="flex items-center">
                    <app-drag-grip />
                    <button
                      uiIconButton
                      type="button"
                      [attr.aria-label]="text.addAria"
                      (click)="addBelow($index)"
                    >
                      <ui-icon [glyph]="plusIcon" />
                    </button>
                    <button
                      uiIconButton
                      variant="danger"
                      type="button"
                      [attr.aria-label]="actionText.remove"
                      (click)="remove($index)"
                    >
                      <ui-icon [glyph]="trash2Icon" />
                    </button>
                  </div>
                </td>
              </tr>
            }
          </tbody>
        </table>
      }

      <button
        type="button"
        uiTextButton
        class="mt-2 inline-flex items-center gap-1.5 text-sm"
        (click)="picking.set(true)"
      >
        <ui-icon [glyph]="plusIcon" class="size-4" />
        {{ text.addKeys }}
      </button>
      @if (picking()) {
        <app-attribute-key-picker
          [hints]="hints()"
          [used]="usedKeys()"
          (add)="addKeys($event); picking.set(false)"
          (closed)="picking.set(false)"
        />
      }
    </fieldset>
  `,
})
export class ProductAttributesEditor {
  protected readonly funnelIcon = funnelIcon;
  protected readonly plusIcon = plusIcon;
  protected readonly trash2Icon = trash2Icon;
  protected readonly triangleAlertIcon = triangleAlertIcon;
  protected readonly adminText = inject(ADMIN_TEXT);
  protected readonly text = inject(ADMIN_TEXT).products.editor.attributes;
  protected readonly actionText = inject(SHARED_TEXT).actions;
  /** Not `sm`: the glyphs are finger-sized below `md`, and they and two cells
   * do not fit the table in between. */
  protected readonly narrow = injectNarrowScreen('md');
  private readonly grid =
    viewChild<ElementRef<HTMLTableSectionElement>>('grid');

  readonly value = input.required<ProductAttribute[]>();
  readonly valueChange = output<ProductAttribute[]>();

  protected readonly picking = signal(false);

  readonly knownKeys = input<readonly AttributeKeyUsage[]>([]);
  readonly definitions = input<readonly AttributeDefinition[]>([]);
  /** The keys at load, left out of the counts (see `attributeHints`). */
  readonly ownKeys = input<readonly string[]>([]);
  /** A set's parts (FR-CAT-10): "Colour (cup)" is then a Colour row. */
  readonly parts = input<readonly string[]>([]);

  protected readonly hints = computed<AttributeHint[]>(() =>
    attributeHints(this.knownKeys(), this.definitions(), this.ownKeys()),
  );

  private readonly hintsByKey = computed(
    () => new Map(this.hints().map((hint) => [hint.key, hint])),
  );

  protected readonly usedKeys = computed(() =>
    this.rows()
      .map((row) => row.key.trim())
      .filter((key) => key !== ''),
  );

  protected readonly marks = computed(() =>
    this.rows().map((row) =>
      attributeRowMarks(row, this.hintsByKey(), this.parts()),
    ),
  );

  protected strayLabel(stray: { part: string; key: string }): string {
    return fillText(this.text.strayPart, stray);
  }

  /** Empty rows go first, the phantom one too, so a name picked on a fresh
   * product fills the first row, not the second. */
  protected addKeys(keys: string[]): void {
    const rows = this.current().filter(
      (row) => row.key.trim() !== '' || row.value.trim() !== '',
    );
    const room = Math.max(0, PRODUCT_ATTRIBUTES_MAX - rows.length);
    const added = keys.slice(0, room).map((key) => ({ key, value: '' }));
    if (added.length === 0) return;
    this.remember();
    this.dropCaret();
    // Into the first new row's value: its name is filled in.
    this.caretPending = { row: rows.length, col: 1 };
    this.valueChange.emit([...rows, ...added]);
  }

  /** At least one empty row, so the table is never empty. */
  protected readonly rows = computed<ProductAttribute[]>(() =>
    this.value().length > 0 ? this.value() : [{ key: '', value: '' }],
  );

  constructor() {
    // Model to DOM: the text of every cell but the one being typed in.
    afterRenderEffect(() => {
      const data = this.rows();
      const tbody = this.grid()?.nativeElement;
      if (!tbody) return;
      // Writing `textContent` under the caret collapses the selection to the
      // start of the editing host, so that one cell is skipped.
      const caret = this.caretPending ? null : this.caretCell();
      const trs = tbody.querySelectorAll('tr');
      data.forEach((row, i) => {
        const tr = trs[i];
        if (!tr) return;
        if (!(caret?.row === i && caret.col === 0)) {
          this.writeCell(tr, 0, row.key);
        }
        if (!(caret?.row === i && caret.col === 1)) {
          this.writeCell(tr, 1, row.value);
        }
      });
      this.applyPendingCaret(tbody, data.length);
    });
  }

  /** The caret's cell as "row:col": no cell of one editing host takes focus,
   * so the selection is the only signal for the focus outline. */
  private readonly activeCell = signal<string | null>(null);

  @HostListener('document:selectionchange')
  protected onSelectionChange(): void {
    const cell = this.caretCell();
    this.activeCell.set(cell ? `${cell.row}:${cell.col}` : null);
  }

  /** An input's focus outline, inside the cell's border so it never overlaps
   * a neighbour. */
  protected cellFocus(row: number, col: number): string {
    return this.activeCell() === `${row}:${col}`
      ? 'outline-1 -outline-offset-1 outline-secondary'
      : '';
  }

  // --- Undo ----------------------------------------------------------------

  /**
   * States before each change, newest last, with their caret. The grid owns
   * its whole history: the browser's never sees the model-driven edits, and
   * half of each would undo in an order matching neither. Typing groups into
   * bursts per cell.
   */
  private readonly undoStack: Snapshot[] = [];
  private readonly redoStack: Snapshot[] = [];
  private typingCell: string | null = null;
  private typingAt = 0;

  private snapshot(): Snapshot {
    return {
      rows: this.current().map((row) => ({ ...row })),
      caret: this.caretCell(),
    };
  }

  private remember(): void {
    this.undoStack.push(this.snapshot());
    this.redoStack.length = 0;
    this.typingCell = null;
  }

  /** One snapshot per burst in a cell, so Ctrl+Z steps back by words. */
  private rememberTyping(): void {
    const cell = this.caretCell();
    const key = cell ? `${cell.row}:${cell.col}` : null;
    const now = Date.now();
    if (key !== null && key === this.typingCell && now - this.typingAt < 600) {
      this.typingAt = now;
      return;
    }
    this.undoStack.push(this.snapshot());
    this.redoStack.length = 0;
    this.typingCell = key;
    this.typingAt = now;
  }

  private restore(from: Snapshot[], to: Snapshot[]): void {
    const previous = from.pop();
    if (!previous) return;
    to.push(this.snapshot());
    this.typingCell = null;
    // Every cell is rewritten, so none may be skipped for the caret.
    this.dropCaret();
    this.caretPending = previous.caret ?? { row: 0, col: 0 };
    this.valueChange.emit(previous.rows);
  }

  // --- Row actions ---------------------------------------------------------

  // Every row action leaves the caret in its row: Ctrl+Z is bound to the
  // grid, and a drag never focuses the handle while a removal takes the
  // clicked button away, so the step could not otherwise be undone.

  protected addBelow(index: number): void {
    this.remember();
    const rows = this.current();
    rows.splice(index + 1, 0, { key: '', value: '' });
    this.dropCaret();
    this.caretPending = { row: index + 1, col: 0 };
    this.valueChange.emit(rows);
  }

  protected remove(index: number): void {
    this.remember();
    this.dropCaret();
    // The row moving up into the gap; `applyPendingCaret` clamps at the end.
    this.caretPending = { row: index, col: 0 };
    this.valueChange.emit(this.current().filter((_, i) => i !== index));
  }

  protected onDrop(event: CdkDragDrop<ProductAttribute[]>): void {
    if (event.previousIndex === event.currentIndex) return;
    this.remember();
    this.dropCaret();
    this.caretPending = { row: event.currentIndex, col: 0 };
    const rows = this.current();
    moveItemInArray(rows, event.previousIndex, event.currentIndex);
    this.valueChange.emit(rows);
  }

  // --- Grid editing --------------------------------------------------------

  protected onInput(): void {
    this.rememberTyping();
    this.emitFromDom();
  }

  private emitFromDom(): void {
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

  /** The browser's copy of a contenteditable table brings stray blank lines,
   * so a multi-cell selection is written as TSV here. */
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
    if (event.ctrlKey || event.metaKey) {
      const key = event.key.toLowerCase();
      if (key === 'z' || key === 'y') {
        // Always claimed: the browser's stack would undo into a state the
        // model never had.
        event.preventDefault();
        if ((key === 'z' && event.shiftKey) || key === 'y') {
          this.restore(this.redoStack, this.undoStack);
        } else {
          this.restore(this.undoStack, this.redoStack);
        }
        return;
      }
    }
    if (event.key === 'Enter') {
      event.preventDefault(); // cells are single-line
      return;
    }
    if (this.typeOverSelection(event)) return;
    if (event.key !== 'Backspace' && event.key !== 'Delete') return;

    // A range is cleared, not merged by contenteditable.
    const range = this.clearableRange();
    if (range) {
      event.preventDefault();
      this.remember();
      this.dropCaret();
      this.caretPending = { row: range.r0, col: range.c0 as 0 | 1 };
      this.valueChange.emit(clearRange(this.current(), range));
      return;
    }
    // At a cell boundary it would merge into the neighbouring cell.
    if (this.atBoundary(event.key)) {
      event.preventDefault();
    }
  }

  /**
   * The selection, never starting left of the cell the mouse went down in: a
   * drag leaving its cell makes Chrome select whole cells, and one begun in the
   * value column grows over the key beside it (anchor `0:1`, focus `0:0`).
   */
  private clearableRange(): GridRange | null {
    const range = this.selectedRange();
    if (!range) return null;
    const pressed = this.pressedCell;
    if (!pressed || pressed.col <= range.c0) return range;
    return { ...range, c0: Math.min(pressed.col, range.c1) };
  }

  /** A printable key over a multi-cell selection replaces the cell the drag
   * began in, as a paste does; left to the browser it would land where the
   * selection starts and take the structure with it. */
  private typeOverSelection(event: KeyboardEvent): boolean {
    if (
      event.key.length !== 1 ||
      event.ctrlKey ||
      event.metaKey ||
      event.altKey
    ) {
      return false;
    }
    if (this.withinOneCell()) return false;
    const target = this.pasteTarget();
    if (!target) return false;

    event.preventDefault();
    this.remember();
    const rows = this.current();
    const row = rows[target.row];
    if (!row) return true;
    rows[target.row] =
      target.col === 0
        ? { ...row, key: event.key }
        : { ...row, value: event.key };
    this.dropCaret();
    this.caretPending = target;
    this.valueChange.emit(rows);
    return true;
  }

  /** Never native: it inserts the clipboard's HTML, nested rows Angular did not
   * render. Tabs or newlines fill outward, up to the cap. */
  protected onPaste(event: ClipboardEvent): void {
    const text = event.clipboardData?.getData('text/plain') ?? '';
    event.preventDefault();
    if (!text) return;

    // One value in one cell is ordinary text entry.
    if (this.withinOneCell() && !/[\t\n\r]/.test(text)) {
      this.rememberTyping();
      this.insertText(text);
      this.emitFromDom();
      return;
    }

    const start = this.pasteTarget();
    if (!start) return;

    this.remember();
    this.dropCaret();
    this.caretPending = start;
    this.valueChange.emit(
      applyPastedGrid(
        this.current(),
        start,
        parseClipboardGrid(text),
        PRODUCT_ATTRIBUTES_MAX,
      ),
    );
  }

  /** The selection's cell, or across cells the one the mouse went down in: the
   * top-left may be a key the selection grew over (see `clearableRange`). */
  private pasteTarget(): GridCell | null {
    if (this.withinOneCell()) return this.caretCell();
    const range = this.selectedRange();
    return (
      this.pressedCell ??
      (range ? { row: range.r0, col: range.c0 as 0 | 1 } : this.caretCell())
    );
  }

  /** The only case where splicing in text is safe: a wider selection holds
   * `<td>`/`<tr>` nodes. */
  private withinOneCell(): boolean {
    const selection = document.getSelection();
    const anchor = this.cellOf(selection?.anchorNode ?? null);
    if (!anchor) return false;
    if (selection?.isCollapsed) return true;
    const focus = this.cellOf(selection?.focusNode ?? null);
    return focus?.row === anchor.row && focus?.col === anchor.col;
  }

  /** Where a drag-selection began. */
  private pressedCell: GridCell | null = null;

  protected onMouseDown(event: MouseEvent): void {
    this.pressedCell = this.cellOf(event.target as Node);
  }

  private insertText(text: string): void {
    const selection = document.getSelection();
    const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
    if (!range) return;
    range.deleteContents();
    const node = document.createTextNode(text);
    range.insertNode(node);
    range.setStartAfter(node);
    range.collapse(true);
    selection?.removeAllRanges();
    selection?.addRange(range);
  }

  // --- Helpers -------------------------------------------------------------

  /** Where the caret must land once the next render has written the cells. */
  private caretPending: GridCell | null = null;

  private applyPendingCaret(tbody: HTMLElement, rowCount: number): void {
    const target = this.caretPending;
    if (!target) return;
    this.caretPending = null;
    const row = Math.min(target.row, rowCount - 1);
    const cell = tbody.querySelector<HTMLElement>(
      `td[data-row="${row}"][data-col="${target.col}"]`,
    );
    if (!cell) return;
    // A range alone does not make the host active, and its shortcuts need it.
    tbody.focus({ preventScroll: true });
    const range = document.createRange();
    range.selectNodeContents(cell);
    range.collapse(false); // to the end of the cell's text
    const selection = document.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  }

  /** So every cell can be rewritten. */
  private dropCaret(): void {
    if (this.caretCell()) document.getSelection()?.removeAllRanges();
    this.activeCell.set(null);
    this.pressedCell = null; // rows are about to move under it
  }

  private writeCell(tr: Element, col: 0 | 1, value: string): void {
    const cell = tr.querySelector(`[data-col="${col}"]`);
    if (cell && cell.textContent !== value) cell.textContent = value;
  }

  private readCell(tr: Element, col: 0 | 1): string {
    return tr.querySelector(`[data-col="${col}"]`)?.textContent ?? '';
  }

  /** The selection anchor's cell. */
  private caretCell(): GridCell | null {
    if (typeof document === 'undefined') return null;
    return this.cellOf(document.getSelection()?.anchorNode ?? null);
  }

  private cellOf(node: Node | null): GridCell | null {
    const tbody = this.grid()?.nativeElement;
    if (!tbody || !node || !tbody.contains(node)) return null;
    const el =
      node.nodeType === Node.TEXT_NODE
        ? node.parentElement
        : (node as Element | null);
    const cell = el?.closest<HTMLElement>('[data-col]');
    if (!cell) return null;
    return {
      row: Number(cell.dataset['row']),
      col: Number(cell.dataset['col']) as 0 | 1,
    };
  }

  /** Only for a selection across cells. */
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

  /** A mutable copy, with the phantom empty row made real. */
  private current(): ProductAttribute[] {
    return this.value().length > 0
      ? [...this.value()]
      : [{ key: '', value: '' }];
  }
}

/** A point in the grid's history. */

interface Snapshot {
  rows: ProductAttribute[];
  caret: GridCell | null;
}
