import { NgTemplateOutlet } from '@angular/common';
import {
  afterRenderEffect,
  Component,
  computed,
  contentChild,
  effect,
  ElementRef,
  inject,
  input,
  signal,
  untracked,
  viewChild,
  viewChildren,
} from '@angular/core';
import { fill } from '../core/fill';
import { GRID_TEXT } from './grid-text';
import { injectNarrowScreen, NarrowBreakpoint } from '../core/narrow-screen';
import { TextButton } from '../actions/text-button';
import {
  columnMinWidth,
  flexibleColumns,
  GridChip,
  GridToggleGroup,
  GridColumn,
} from './grid-column';
import { GridFilterSelect } from './grid-filter-select';
import { GridChips } from './grid-chips';
import { GridToggles } from './grid-toggles';
import { GridNarrowControls } from './grid-narrow-controls';
import { fitWidths, resizeBoundary } from './grid-resize';
import { GridSortHeader } from './grid-sort-header';
import { GridCardTemplate } from './grid-card-template';
import { GridRowTemplate } from './grid-row-template';
import { GridWidths, GridWidthsStore } from './grid-widths';

/** How far one arrow-key press moves a boundary. */
const KEYBOARD_STEP_PX = 16;

/**
 * A row that is over, greyed per cell: a child cannot undo its parent's
 * opacity, and the cells the page marks `data-keep` (its actions, the state
 * badge) must not fade.
 */
const MUTED_CELLS = '[&>td:not([data-keep])]:opacity-50';

/**
 * A table on a wide screen and a list of records below `narrowBelow`, from one
 * column model: a column is a heading, a line in the narrow filter panel and a
 * stored width alike. The cells are the page's (`uiGridRow`, `uiGridCard`).
 *
 * Widths are measured: the browser lays out the first render with rows, the
 * widths are frozen into a `<colgroup>`, and the table stays fixed, so paging
 * never moves the columns. A dragged boundary is stored per grid; a reset
 * measures again.
 */
@Component({
  selector: 'ui-data-grid',
  imports: [
    GridChips,
    NgTemplateOutlet,
    TextButton,
    GridSortHeader,
    GridFilterSelect,
    GridNarrowControls,
    GridToggles,
  ],
  template: `
    @if (narrow()) {
      <!-- Reading width: records are read down, not scanned across. -->
      <div class="max-w-3xl">
        <ui-grid-narrow-controls
          [columns]="columns()"
          [chips]="chips()"
          [toggles]="toggles()"
          [sort]="sort()"
          [defaultSort]="defaultSort()"
          [defaultSortLabel]="defaultSortLabel() || gridText.sortDefault"
          [filtered]="filtered()"
        />

        <!-- Always present, so the live region exists before its text changes. -->
        <p class="mb-2 text-sm text-ink-subtle" aria-live="polite">
          {{ countText() }}
        </p>

        <!-- A list, not stacked cells: no heading is on screen to name them.
             Absent when empty: two borders with nothing between read as one. -->
        @if (rows().length) {
          <ul
            class="divide-y divide-edge border-y border-edge"
            [attr.aria-busy]="busy() ? 'true' : null"
          >
            @for (row of rows(); track trackBy()(row)) {
              <li class="py-3" [class]="rowClass()(row)">
                <ng-container
                  [ngTemplateOutlet]="card().template"
                  [ngTemplateOutletContext]="{ $implicit: row }"
                />
              </li>
            }
          </ul>
        }
      </div>
    } @else {
      @if (toggles().length) {
        <ui-grid-toggles class="mb-4" [groups]="toggles()" />
      }
      <!-- Narrowings with no column; inside the filter panel when narrow. -->
      @if (chips().length) {
        <ui-grid-chips class="mb-4" [chips]="chips()" />
      }

      <div>
        <!-- One line kept for count and reset: a reset link appearing on the
             first drag would push the table down mid-gesture. Folded but
             present when empty, so the count is announced when rows return. -->
        <div
          class="flex items-center justify-between gap-4 overflow-hidden
                 text-sm"
          [class]="countText() || customized() ? 'h-6' : 'h-0'"
        >
          <p class="text-ink-subtle" aria-live="polite">{{ countText() }}</p>
          @if (customized()) {
            <button type="button" uiTextButton (click)="resetWidths()">
              {{ gridText.resetWidths }}
            </button>
          }
        </div>

        <div class="overflow-x-auto">
          <!-- Rendered without rows too: its header holds the filters that
               emptied it. -->
          <table
            #table
            [style.min-width.px]="minTableWidth()"
            class="w-full text-left text-sm
                   [&_th,&_td]:py-2 [&_th,&_td]:pr-4 [&_th,&_td]:pl-2
                   [&_th:first-child,&_td:first-child]:pl-0
                   [&_th:last-child,&_td:last-child]:pr-0"
            [class.table-fixed]="widths()"
            [class.table-auto]="!widths()"
            [attr.aria-busy]="busy() ? 'true' : null"
          >
            <!-- Fixed columns take their pixels; the rest share what is left. -->
            @if (widths(); as columnWidths) {
              <colgroup>
                @for (column of columns(); track column.key) {
                  @if (column.fixedWidth; as fixed) {
                    <col [style.width.px]="fixed" />
                  } @else {
                    <col [style.width.%]="columnWidths[column.key] * 100" />
                  }
                }
              </colgroup>
            }
            <thead>
              <tr class="border-b border-edge text-ink-subtle">
                @for (column of columns(); track column.key) {
                  <th
                    #headerCell
                    class="relative font-medium"
                    [class.text-right]="column.align === 'right'"
                  >
                    @if (column.filter; as filter) {
                      <ui-grid-filter-select
                        [param]="filter.param"
                        [options]="filter.options"
                        [value]="filter.value"
                        [ariaLabel]="filter.label"
                        [toParams]="filter.toParams"
                      />
                    } @else if (column.sort; as columnSort) {
                      <ui-grid-sort
                        [asc]="columnSort.asc"
                        [desc]="columnSort.desc"
                        [descFirst]="columnSort.descFirst ?? false"
                        [label]="column.label ?? ''"
                        [sort]="sort()"
                        [defaultSort]="defaultSort()"
                      />
                    } @else if (column.label) {
                      {{ column.label }}
                    } @else if (column.srLabel) {
                      <span class="sr-only">{{ column.srLabel }}</span>
                    }

                    <!-- A boundary trades width between its neighbours, so the
                         table never outgrows the page; only between two
                         flexible columns. -->
                    @if (widths() && handleAt()[$index] >= 0) {
                      <div
                        role="separator"
                        aria-orientation="vertical"
                        tabindex="0"
                        class="group/handle absolute top-0 right-0 z-10 flex
                               h-full w-3 translate-x-1/2 cursor-col-resize
                               touch-none items-stretch justify-center"
                        [attr.aria-label]="resizeLabel(column)"
                        [title]="gridText.resizeColumn"
                        (pointerdown)="startDrag($event, handleAt()[$index])"
                        (dblclick)="resetWidths()"
                        (keydown)="onHandleKey($event, handleAt()[$index])"
                      >
                        <span
                          class="w-px bg-transparent
                                 group-hover/handle:bg-edge-strong
                                 group-focus/handle:bg-accent"
                        ></span>
                      </div>
                    }
                  </th>
                }
              </tr>
            </thead>
            <tbody class="divide-y divide-edge-subtle">
              @for (row of rows(); track trackBy()(row)) {
                <tr [class]="rowClasses(row)">
                  <ng-container
                    [ngTemplateOutlet]="cells().template"
                    [ngTemplateOutletContext]="{ $implicit: row }"
                  />
                </tr>
              }
            </tbody>
          </table>
        </div>
      </div>
    }

    @if (rows().length === 0) {
      <p class="mt-6 text-ink-subtle">{{ emptyMessage() }}</p>
      <ng-content select="[gridEmpty]" />
    }
  `,
})
export class DataGrid<T> {
  private readonly store = inject(GridWidthsStore);
  protected readonly gridText = inject(GRID_TEXT);

  /** Both watched: a media query subscribes at construction, before the
   * input is known. */
  private readonly narrowMd = injectNarrowScreen('md');
  private readonly narrowLg = injectNarrowScreen('lg');
  protected readonly narrow = computed(() =>
    this.narrowBelow() === 'lg' ? this.narrowLg() : this.narrowMd(),
  );

  /** What the stored widths are filed under; stable across releases. */
  readonly gridId = input.required<string>();
  readonly columns = input.required<readonly GridColumn[]>();
  readonly rows = input.required<readonly T[]>();
  readonly trackBy = input.required<(row: T) => string>();
  /** The sort in effect, resolved; null where no column owns it. */
  readonly sort = input<string | null>(null);
  readonly defaultSort = input('');
  /** Whether a reload is in flight, for `aria-busy`; the rows on screen stay. */
  readonly busy = input(false);
  /** No rows at all, or none that match: the page words which. */
  readonly emptyMessage = input('');
  /** A row's own classes, beside the muting. */
  readonly rowClass = input<(row: T) => string>(() => '');
  /** Whether a row is over, and greyed. A card template applies it itself:
   * only it knows which part is the body and which the buttons. */
  readonly muted = input<(row: T) => boolean>(() => false);
  /** Narrowings with no column: chips, counted with the column filters. */
  readonly chips = input<readonly GridChip[]>([]);
  /** On/off narrowings: above the table, or inside the narrow panel. */
  readonly toggles = input<readonly GridToggleGroup[]>([]);
  /** Where the grid turns into records. */
  readonly narrowBelow = input<NarrowBreakpoint>('lg');
  /** Whether anything narrows the list, the search included: something to
   * clear. */
  readonly filtered = input(false);
  /** The name of an ordering no column owns; `sortDefault` otherwise. */
  readonly defaultSortLabel = input('');
  /** Rows across all pages, for a paged list; otherwise the rows are counted. */
  readonly total = input<number | null>(null);
  /** The count's wording, `{count}`; none, no line. */
  readonly countLabel = input('');

  /** Empty for an empty list: the empty message says so. */
  protected readonly countText = computed(() => {
    const count = this.total() ?? this.rows().length;
    if (!this.countLabel() || count === 0) return '';
    return fill(this.countLabel(), { count });
  });

  protected readonly cells =
    contentChild.required<GridRowTemplate<T>>(GridRowTemplate);
  protected readonly card =
    contentChild.required<GridCardTemplate<T>>(GridCardTemplate);

  private readonly table = viewChild<ElementRef<HTMLTableElement>>('table');
  private readonly headerCells =
    viewChildren<ElementRef<HTMLTableCellElement>>('headerCell');

  /** The flexible columns' keys, compared by value: the columns are rebuilt
   * on every filter change, and a new identity would drop the widths. */
  private readonly keys = computed(
    () => flexibleColumns(this.columns()).map((c) => c.key),
    { equal: (a, b) => a.length === b.length && a.every((k, i) => k === b[i]) },
  );

  /** Per column, the flexible boundary its right edge owns, or -1. */
  protected readonly handleAt = computed(() => {
    const columns = this.columns();
    let flexIndex = -1;
    return columns.map((column, i) => {
      if (column.fixedWidth !== undefined) return -1;
      flexIndex += 1;
      const next = columns[i + 1];
      return next && next.fixedWidth === undefined ? flexIndex : -1;
    });
  });

  /** Every column at its minimum; narrower, the wrapper scrolls, since a
   * percentage cannot hold a pixel floor. */
  protected readonly minTableWidth = computed(() =>
    this.columns().reduce(
      (total, column) => total + (column.fixedWidth ?? columnMinWidth(column)),
      0,
    ),
  );

  /** What the flexible columns have to share: the table less every fixed one. */
  private flexibleWidth(): number {
    const table = this.table()?.nativeElement.clientWidth ?? 0;
    const fixed = this.columns().reduce(
      (total, column) => total + (column.fixedWidth ?? 0),
      0,
    );
    return table - fixed;
  }

  /** Null until measured: one render laid out by the browser. */
  protected readonly widths = signal<GridWidths | null>(null);
  /** Whether the widths were dragged, so there is something to reset. */
  protected readonly customized = signal(false);

  constructor() {
    // Per column set: one grid id may serve two sets of columns.
    effect(() => {
      const stored = this.store.load(this.gridId(), this.keys());
      untracked(() => {
        this.widths.set(stored);
        this.customized.set(stored !== null);
      });
    });

    // Measured once rows are laid out: a bare header sizes to its headings.
    afterRenderEffect(() => {
      if (this.narrow() || this.widths() !== null) return;
      if (this.rows().length === 0) return;
      const cells = this.headerCells();
      if (cells.length !== this.columns().length) return;
      const flexible = cells.filter(
        (_, i) => this.columns()[i].fixedWidth === undefined,
      );
      const raw = flexible.map((cell) => cell.nativeElement.offsetWidth);
      // Not laid out (off-screen, a test DOM): fitting would freeze minimums.
      if (raw.every((px) => px === 0)) return;

      // Never below a column's minimum: a filter heading's `w-full` select
      // adds nothing to the measured width.
      const measured = fitWidths(
        this.keys(),
        raw,
        flexibleColumns(this.columns()).map(columnMinWidth),
        this.flexibleWidth(),
      );
      if (measured) this.widths.set(measured);
    });
  }

  protected rowClasses(row: T): string {
    const own = this.rowClass()(row);
    return this.muted()(row) ? `${own} ${MUTED_CELLS}` : own;
  }

  protected resizeLabel(column: GridColumn): string {
    return fill(this.gridText.resizeColumnOfAria, {
      column: column.label ?? column.srLabel ?? column.key,
    });
  }

  /** Pointer capture keeps the drag once the pointer leaves the thin handle. */
  protected startDrag(event: PointerEvent, index: number): void {
    const handle = event.currentTarget as HTMLElement;
    const start = this.widths();
    const tableWidth = this.flexibleWidth();
    if (!start || tableWidth <= 0) return;

    event.preventDefault();
    handle.setPointerCapture(event.pointerId);
    const startX = event.clientX;
    const keys = this.keys();
    const mins = flexibleColumns(this.columns()).map(columnMinWidth);

    const move = (moved: PointerEvent) =>
      this.widths.set(
        resizeBoundary(
          start,
          keys,
          index,
          moved.clientX - startX,
          tableWidth,
          mins,
        ),
      );
    const end = () => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', end);
      handle.removeEventListener('pointercancel', end);
      this.persist();
    };

    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
  }

  /** The same boundary by keyboard. */
  protected onHandleKey(event: KeyboardEvent, index: number): void {
    const delta =
      event.key === 'ArrowLeft'
        ? -KEYBOARD_STEP_PX
        : event.key === 'ArrowRight'
          ? KEYBOARD_STEP_PX
          : 0;
    if (!delta) return;

    const current = this.widths();
    const tableWidth = this.flexibleWidth();
    if (!current || tableWidth <= 0) return;

    event.preventDefault();
    this.widths.set(
      resizeBoundary(
        current,
        this.keys(),
        index,
        delta,
        tableWidth,
        flexibleColumns(this.columns()).map(columnMinWidth),
      ),
    );
    this.persist();
  }

  /** Forgets dragged widths and measures again: the reset link, a double-click. */
  protected resetWidths(): void {
    this.store.clear(this.gridId());
    this.customized.set(false);
    this.widths.set(null);
  }

  private persist(): void {
    const widths = this.widths();
    if (!widths) return;
    this.store.save(this.gridId(), widths);
    this.customized.set(true);
  }
}
