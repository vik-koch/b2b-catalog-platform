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
import { RouterLink } from '@angular/router';
import {
  AttributeDefinition,
  AttributeKeyUsage,
  PRODUCT_ATTRIBUTES_MAX,
  ProductAttribute,
} from '@b2b-catalog-platform/shared';
import { ADMIN_TEXT } from '../../config/admin-text';
import { AdminIcon } from '../../ui/icons/admin-icon';
import { HintBadge } from '../../ui/hint-badge';
import { FieldLabel } from '../../ui/field-label';
import {
  AttributeHint,
  attributeHints,
  attributeIsKnown,
  AttributeRowStatus,
  attributeRowStatus,
} from './attribute-hints';
import { AttributeKeyPicker } from './attribute-key-picker';
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
 * Angular owns the row/cell *structure* (via `@for`) but not the cell *text*:
 * the text is written to the DOM from the model, skipping only the cell the
 * caret is in, and read back on input — so typing is never overwritten
 * mid-caret while every other cell still tracks the model. Structural keys that
 * a contenteditable would otherwise use to merge/delete cells (Enter, and
 * Backspace/Delete at a cell boundary) are intercepted, as is paste, so the
 * table shape the framework rendered can never be corrupted from inside the
 * editable region.
 */
@Component({
  selector: 'app-product-attributes-editor',
  imports: [
    AdminIcon,
    AttributeKeyPicker,
    HintBadge,
    CdkDropList,
    CdkDrag,
    CdkDragHandle,
    CdkDragPreview,
    FieldLabel,
    RouterLink,
  ],
  template: `
    <fieldset>
      <legend appFieldLabel>{{ text.heading }}</legend>

      <app-attribute-key-picker
        [hints]="hints()"
        [used]="usedKeys()"
        (add)="addKeys($event)"
      />

      <!-- Fixed layout, like the packaging grid below: a long value wraps and
           grows the row instead of stretching the column, so the two tables
           cannot drift apart on one product and line up on the next. -->
      <table class="w-full max-w-2xl table-fixed border-collapse text-sm">
        <thead>
          <tr class="text-left text-subtle">
            <th class="w-1/3 pb-1 font-medium">{{ text.key }}</th>
            <th class="pb-1 font-medium">{{ text.value }}</th>
            <th class="w-32"></th>
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
            <!-- The badges are positioned against the row, not the cells they
                 mark: they are rendered from the action cell (the only part of
                 the row outside the editable region) and the column edges are
                 fractions of a fixed-layout table, so a fraction of the row is
                 exactly the boundary they sit on. -->
            <tr cdkDrag [cdkDragData]="row" class="relative">
              <!-- A detached table row collapses (loses cell widths), so the
                   floating drag preview is a plain labelled chip instead. -->
              <div
                *cdkDragPreview
                class="rounded-md border border-border-strong bg-white px-3 py-1.5 text-sm shadow-md"
              >
                {{ row.key || text.key }}
              </div>
              <!-- An explicit line-height, not just a cell height: an empty cell
                   otherwise has a zero-height line box, so the caret sits at the
                   top on the first click and only drops into place once a
                   character gives the line something to measure. It has to stay
                   under the cell's content box (h-10 less padding and borders),
                   or the first character grows the row instead. -->
              <!-- The funnel overlaps this cell from the action cell (see
                   below), so the text gets out of its way. -->
              <td
                [attr.data-row]="$index"
                data-col="0"
                class="h-10 border border-border-strong bg-white px-2 py-1.5 leading-6 align-middle break-words"
                [class]="
                  cellFocus($index, 0) + (isFilterable(row) ? ' pr-9' : '')
                "
              ></td>
              <!-- The badge overlaps this cell from the action cell beside it
                   (see below), so the text gets out of its way. -->
              <td
                [attr.data-row]="$index"
                data-col="1"
                class="h-10 border border-border-strong bg-white px-2 py-1.5 leading-6 align-middle break-words"
                [class]="cellFocus($index, 1) + (valueMark(row) ? ' pr-9' : '')"
              ></td>
              <td
                contenteditable="false"
                class="w-32 border-0 pl-3 align-middle select-none"
              >
                <!-- Everything here is outside the editable region, so it is
                     safe to render — which is also why the marks live here and
                     are positioned back over the cells they belong to rather
                     than inside them: a node inside a cell would be wiped by
                     the next write from the model. -->
                @if (isFilterable(row)) {
                  <!-- Over the key cell, because it is the *key* that the shop
                       filters by; the value cell says what happens to this
                       row's value. -->
                  <app-hint-badge
                    class="absolute top-1/2 right-2/3 mr-2 -translate-y-1/2"
                    tone="neutral"
                    [label]="text.filterable"
                  >
                    <app-admin-icon name="funnel" class="h-3.5 w-3.5" />
                  </app-hint-badge>
                }
                @if (valueMark(row); as mark) {
                  @if (mark === 'not-numeric') {
                    <app-hint-badge
                      class="absolute top-1/2 right-32 mr-2 -translate-y-1/2"
                      tone="warning"
                      [label]="text.notNumeric"
                    >
                      <app-admin-icon
                        name="triangle-alert"
                        class="h-3.5 w-3.5"
                      />
                    </app-hint-badge>
                  } @else {
                    <!-- The declared unit, where the packaging grid below puts
                         its own: after the number it measures, in the same
                         small grey. It is never part of the value — the cell
                         holds "1000", the shop shows "1000 g". -->
                    <span
                      class="absolute top-1/2 right-32 mr-2 -translate-y-1/2 text-xs text-subtle"
                      >{{ mark }}</span
                    >
                  }
                }
                <!-- Tighter than a normal control row: four affordances have
                     to fit the same column width the packaging grid uses, so
                     the two tables keep lining up. -->
                <div class="flex items-center gap-0.5">
                  <!-- Where else this attribute is used, in the inventory:
                       every value in use under the key, with its counts, and
                       the product drill-down from there. A new tab on purpose —
                       leaving a half-edited product would trip the
                       unsaved-changes guard for what is only a glance. -->
                  @if (isKnown(row)) {
                    <a
                      class="p-1 text-stone-400 hover:text-accent"
                      target="_blank"
                      routerLink="/admin/attributes/inventory"
                      [queryParams]="{ key: row.key.trim() }"
                      [attr.aria-label]="text.showUsage"
                      [title]="text.showUsage"
                    >
                      <app-admin-icon name="square-menu" class="h-4 w-4" />
                    </a>
                  } @else {
                    <!-- Kept in place rather than dropped: the row actions
                         would otherwise shift a column as a key is typed. Its
                         being dead *is* the statement that nothing else in the
                         catalog carries the name. -->
                    <span
                      aria-disabled="true"
                      class="p-1 text-stone-200"
                      [title]="linkHint(row)"
                      [attr.aria-label]="linkHint(row)"
                    >
                      <app-admin-icon name="square-menu" class="h-4 w-4" />
                    </span>
                  }
                  <button
                    type="button"
                    cdkDragHandle
                    class="cursor-grab p-1 text-stone-300 hover:text-subtle active:cursor-grabbing"
                    [attr.aria-label]="common.reorder"
                  >
                    <app-admin-icon name="grip-vertical" class="h-5 w-5" />
                  </button>
                  <button
                    type="button"
                    class="p-1 text-stone-400 hover:text-accent"
                    [attr.aria-label]="text.add"
                    (click)="addBelow($index)"
                  >
                    <app-admin-icon name="plus" class="h-5 w-5" />
                  </button>
                  <button
                    type="button"
                    class="p-1 text-stone-400 hover:text-red-700"
                    [attr.aria-label]="common.remove"
                    (click)="remove($index)"
                  >
                    <app-admin-icon name="trash-2" class="h-5 w-5" />
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

  /** What the rest of the catalog carries, for the picker and the badges. */
  readonly knownKeys = input<readonly AttributeKeyUsage[]>([]);
  readonly definitions = input<readonly AttributeDefinition[]>([]);
  /**
   * The keys this product carried when it was loaded. They are discounted from
   * the counts, so the badges speak about the rest of the catalog and a name
   * only this product uses keeps saying so after it has been saved.
   */
  readonly ownKeys = input<readonly string[]>([]);

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

  /** What this row's key means to the catalog; drives the one status badge. */
  protected rowStatus(row: ProductAttribute): AttributeRowStatus {
    return attributeRowStatus(row, this.hintsByKey());
  }

  /**
   * Whether the shop filters by this row's key — the funnel over the key cell.
   * It says nothing about the value: a declared key stays filterable even where
   * this row's value drops out of the facet, which the value cell reports.
   */
  protected isFilterable(row: ProductAttribute): boolean {
    const status = this.rowStatus(row);
    return status === 'filterable' || status === 'not-numeric';
  }

  /**
   * What belongs over the value cell: the declared unit, or `'not-numeric'` for
   * the warning that replaces it once the value cannot be read as a number
   * (FR-ATTR-03). An empty cell keeps the unit — nothing is wrong with a row
   * that is not typed yet, and the unit is the best hint of what to type.
   */
  protected valueMark(row: ProductAttribute): string | null {
    if (this.rowStatus(row) === 'not-numeric') return 'not-numeric';
    const hint = this.hintsByKey().get(row.key.trim());
    return hint?.unit ?? null;
  }

  /** What the dead link says: why there is nothing behind it. */
  protected linkHint(row: ProductAttribute): string {
    return this.rowStatus(row) === 'unknown'
      ? this.text.unknownKey
      : this.text.showUsage;
  }

  /** Whether anything else in the catalog knows the name — no link if not. */
  protected isKnown(row: ProductAttribute): boolean {
    const hint = this.hintsByKey().get(row.key.trim());
    return hint !== undefined && attributeIsKnown(hint);
  }

  /**
   * Append one empty row per picked name. Rows with nothing in them at all are
   * dropped first — including the phantom one an empty grid renders — so
   * picking a name on a fresh product fills the first row rather than the
   * second.
   */
  protected addKeys(keys: string[]): void {
    const rows = this.current().filter(
      (row) => row.key.trim() !== '' || row.value.trim() !== '',
    );
    const room = Math.max(0, PRODUCT_ATTRIBUTES_MAX - rows.length);
    const added = keys.slice(0, room).map((key) => ({ key, value: '' }));
    if (added.length === 0) return;
    this.remember();
    this.dropCaret();
    // Into the first new row's value: the name is already filled in.
    this.caretPending = { row: rows.length, col: 1 };
    this.valueChange.emit([...rows, ...added]);
  }

  /** Always render at least one (empty) row so the table is never empty. */
  protected readonly rows = computed<ProductAttribute[]>(() =>
    this.value().length > 0 ? this.value() : [{ key: '', value: '' }],
  );

  constructor() {
    // Model → DOM. Angular owns the row/cell structure, this owns the text.
    afterRenderEffect(() => {
      const data = this.rows();
      const tbody = this.grid()?.nativeElement;
      if (!tbody) return;
      // The cell being typed in is left alone: writing `textContent` replaces
      // the text node under the caret, which collapses the selection to the
      // start of the editing host — the "caret jumps to the first cell" bug.
      // Every *other* cell is written, so a structural change (remove, drop,
      // undo) always reaches the DOM even while the grid has focus.
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
    const cell = this.caretCell();
    this.activeCell.set(cell ? `${cell.row}:${cell.col}` : null);
  }

  /** Matches the focus outline of a normal input, drawn inside the cell's own
   * border so it never overlaps its neighbours. */
  protected cellFocus(row: number, col: number): string {
    return this.activeCell() === `${row}:${col}`
      ? 'outline-2 -outline-offset-2 outline-secondary'
      : '';
  }

  // --- Undo ----------------------------------------------------------------

  /**
   * States from before each change, newest last, with the caret that goes with
   * them. The grid owns its whole history rather than leaning on the browser's:
   * structural edits (add, remove, reorder, paste, range clear) rewrite the
   * model and re-render from it, so the native stack never sees them, and a
   * half-native history would undo text and rows in an order that matches
   * neither. Typing is grouped into bursts per cell, the way an editor does it.
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

  /** Snapshot before a structural change, so Ctrl+Z can put it back. */
  private remember(): void {
    this.undoStack.push(this.snapshot());
    this.redoStack.length = 0;
    this.typingCell = null;
  }

  /**
   * Snapshot before a keystroke — but only one per burst of typing in the same
   * cell, so Ctrl+Z steps back by words rather than by character.
   */
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
    // The rows are about to be replaced wholesale: drop the caret so no cell is
    // skipped by the guard above, and put it back once the text has landed.
    this.dropCaret();
    this.caretPending = previous.caret ?? { row: 0, col: 0 };
    this.valueChange.emit(previous.rows);
  }

  // --- Row actions ---------------------------------------------------------

  /**
   * Every row action leaves the caret in the row it acted on.
   *
   * Not only for the obvious reason. Ctrl+Z is bound to the grid, so it is
   * reachable only while something inside it has focus — and a drag never
   * gives the handle focus (the CDK swallows the mousedown), while a removal
   * takes the clicked button out of the DOM with the row. Both would leave the
   * step on the undo stack with no way to press it, until some later click
   * happened to land back inside the grid.
   */

  /** Insert a new empty row directly below the given one. */
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
    // The row that moves up into the gap — or the new last row, once the one
    // removed was the last; `applyPendingCaret` clamps it.
    this.caretPending = { row: index, col: 0 };
    this.valueChange.emit(this.current().filter((_, i) => i !== index));
  }

  protected onDrop(event: CdkDragDrop<ProductAttribute[]>): void {
    if (event.previousIndex === event.currentIndex) return;
    this.remember();
    // Drop the caret so the grid re-renders every cell from the reordered
    // model rather than leaving the typed-in one behind.
    this.dropCaret();
    this.caretPending = { row: event.currentIndex, col: 0 };
    const rows = this.current();
    moveItemInArray(rows, event.previousIndex, event.currentIndex);
    this.valueChange.emit(rows);
  }

  // --- Grid editing --------------------------------------------------------

  /** Read every cell back from the DOM after a keystroke. */
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
    if (event.ctrlKey || event.metaKey) {
      const key = event.key.toLowerCase();
      if (key === 'z' || key === 'y') {
        // The grid owns its history, so the shortcut is always claimed — the
        // browser's stack has not seen the model-driven edits and would undo
        // into a state the model never had.
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

    // A multi-cell selection + Delete/Backspace clears those cells (Excel-style)
    // rather than letting contenteditable merge them.
    const range = this.clearableRange();
    if (range) {
      event.preventDefault();
      this.remember();
      this.dropCaret();
      this.caretPending = { row: range.r0, col: range.c0 as 0 | 1 };
      this.valueChange.emit(clearRange(this.current(), range));
      return;
    }
    // A collapsed caret at a cell boundary would otherwise merge into the
    // neighbouring cell — block it so the structure stays intact.
    if (this.atBoundary(event.key)) {
      event.preventDefault();
    }
  }

  /**
   * The cells Delete clears: the selection, minus any column the browser added
   * to it on the way out of the cell the drag began in.
   *
   * Same trap `pasteTarget` documents, with a worse outcome. A drag stops being
   * a text selection once it leaves its cell — Chrome selects whole cells, and
   * one begun in the *value* column grows left over the key beside it (measured:
   * anchor `0:1`, focus `0:0`). Clearing that literally wipes a key nobody
   * dragged over and drops the caret into it, so the next character rewrites the
   * key. The range therefore never starts left of the cell the mouse went down
   * in. A drag down the value column is a genuine two-cell selection and is
   * untouched by this.
   */
  private clearableRange(): GridRange | null {
    const range = this.selectedRange();
    if (!range) return null;
    const pressed = this.pressedCell;
    if (!pressed || pressed.col <= range.c0) return range;
    return { ...range, c0: Math.min(pressed.col, range.c1) };
  }

  /**
   * A printable key pressed while the selection spans more than one cell.
   *
   * Left to the browser, the character lands wherever the selection happens to
   * start — the key column, for a value the user dragged over and out of, which
   * is how a selection silently grows past its cell — and takes the structure
   * of everything it spans with it. Handled here it does what a spreadsheet
   * does: it replaces the cell the drag *began* in, the same target a paste
   * uses, and leaves the rest of the selection alone.
   */
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

  /**
   * Paste is always handled here, never by contenteditable: the native one
   * inserts the clipboard's HTML, which for anything copied out of a table
   * means nested rows inside a cell — a structure Angular did not render and
   * cannot reconcile. A plain value goes into the target cell as text; a value
   * with tabs or newlines fills outward from it, Excel-style, adding rows up to
   * the cap.
   */
  protected onPaste(event: ClipboardEvent): void {
    const text = event.clipboardData?.getData('text/plain') ?? '';
    event.preventDefault();
    if (!text) return;

    // A single value inside one cell is ordinary text entry: let the browser
    // splice it in at the caret and read the result back.
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

  /**
   * Where a paste lands: the cell the selection is in, or — once it spans more
   * than one — the cell the mouse went down in.
   *
   * Not the top-left of the selection, though that is the spreadsheet rule.
   * Dragging over text stops being a text selection the moment the pointer
   * leaves the cell: the browser switches to selecting whole cells, and a
   * selection begun in the value column silently grows to cover the key column
   * beside it. Its top-left is then a cell the user never pointed at, and the
   * paste would land one column to the left of the text they meant to replace.
   */
  private pasteTarget(): GridCell | null {
    if (this.withinOneCell()) return this.caretCell();
    const range = this.selectedRange();
    return (
      this.pressedCell ??
      (range ? { row: range.r0, col: range.c0 as 0 | 1 } : this.caretCell())
    );
  }

  /**
   * Whether the whole selection sits inside a single cell — the only case where
   * splicing text in at the caret is safe. A selection that reaches out of the
   * cell holds `<td>`/`<tr>` nodes, and replacing its contents would take the
   * table's structure with it.
   */
  private withinOneCell(): boolean {
    const selection = document.getSelection();
    const anchor = this.cellOf(selection?.anchorNode ?? null);
    if (!anchor) return false;
    if (selection?.isCollapsed) return true;
    const focus = this.cellOf(selection?.focusNode ?? null);
    return focus?.row === anchor.row && focus?.col === anchor.col;
  }

  /** The cell the mouse last went down in — where a drag-selection began. */
  private pressedCell: GridCell | null = null;

  protected onMouseDown(event: MouseEvent): void {
    this.pressedCell = this.cellOf(event.target as Node);
  }

  /** Splice text in at the caret, replacing whatever it spans in that cell. */
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
    // Focus *and* selection: putting a range inside an editing host does not
    // make it the active element, and the grid's shortcuts are bound to the
    // host — a caret it cannot type or undo into is only a decoration.
    tbody.focus({ preventScroll: true });
    const range = document.createRange();
    range.selectNodeContents(cell);
    range.collapse(false); // to the end of the cell's text
    const selection = document.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  }

  /** Take the caret out of the grid so cells can be rewritten under it. */
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

  /** The cell the caret (or a selection anchor) is in, or null if it is out. */
  private caretCell(): GridCell | null {
    if (typeof document === 'undefined') return null;
    return this.cellOf(document.getSelection()?.anchorNode ?? null);
  }

  /** The data cell (row/col) a DOM node sits in, or null. */
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

/** A point in the grid's history: the rows, and where the caret was. */
interface Snapshot {
  rows: ProductAttribute[];
  caret: GridCell | null;
}
