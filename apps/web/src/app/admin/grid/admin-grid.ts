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
import { RouterLink } from '@angular/router';
import { fillText } from '@b2b-catalog-platform/shared';
import { ADMIN_TEXT } from '../../config/admin-text';
import { injectNarrowScreen, NarrowBreakpoint } from '../../core/narrow-screen';
import { IconButton } from '../../ui/icon-button';
import { AdminIcon } from '../../ui/icons/admin-icon';
import {
  columnMinWidth,
  flexibleColumns,
  GridChip,
  GridColumn,
} from './grid-column';
import { GridFilterSelect } from './grid-filter-select';
import { GridNarrowControls } from './grid-narrow-controls';
import { DEFAULT_ADMIN_SORT } from './grid-query';
import { fitWidths, resizeBoundary } from './grid-resize';
import { GridSortHeader } from './grid-sort-header';
import { GridCardTemplate, GridRowTemplate } from './grid-templates';
import { GridWidths, GridWidthsStore } from './grid-widths';

/** How far one press of an arrow key moves a column boundary. Coarse enough to
 * be worth pressing, fine enough to land on a width. */
const KEYBOARD_STEP_PX = 16;

/**
 * A row that is over: greyed, except for the cells that say so.
 *
 * Per cell rather than on the row, because opacity is not something a child can
 * undo — and two kinds of cell must not fade with the rest: the buttons, which
 * are what the row is still listed for, and the badge naming the state, which
 * is the reason it is greyed at all. Both are marked `data-keep` by the page
 * that writes them. Written out as one string so Tailwind's scanner can see it.
 */
const MUTED_CELLS = '[&>td:not([data-keep])]:opacity-50';

/**
 * The shape every admin list takes: a table on a desktop, a list of records on
 * a phone, and one column model behind both (FR-ADM-05).
 *
 * The three lists used to be three hand-written tables, each with its own
 * hard-coded column widths — percentages in two of them, rems in the third —
 * its own copy of the paging nav, and its filters nailed into `<th>` elements
 * where a phone could not reach them. Declaring the columns as data is what
 * lets the same column be a heading, a line in the phone's filter sheet, and an
 * entry in the widths an admin dragged.
 *
 * **Widths** are measured, not guessed: the first render with rows in it is
 * laid out by the browser, the resulting column widths are frozen into a
 * `<colgroup>`, and the table is fixed from then on — so paging or filtering
 * swaps the rows without the columns jumping, which is what `table-fixed` was
 * for, while the widths themselves come from the content rather than from a
 * developer's estimate. Dragging a boundary overrides them and is remembered
 * per grid; resetting throws that away and measures again.
 */
@Component({
  selector: 'app-admin-grid',
  imports: [
    NgTemplateOutlet,
    RouterLink,
    AdminIcon,
    IconButton,
    GridSortHeader,
    GridFilterSelect,
    GridNarrowControls,
  ],
  template: `
    @if (narrow()) {
      <app-grid-narrow-controls
        [columns]="columns()"
        [chips]="chips()"
        [sort]="sort()"
        [defaultSort]="defaultSort()"
        [defaultSortLabel]="defaultSortLabel() || common.sortDefault"
        [filtered]="filtered()"
      />

      <!-- A list, not a table with its cells stacked: on a phone these are
           records read down, and the column headings that would be announced
           with each cell are not on the screen to be read. Divided the way the
           storefront divides its product lines, so the two read as one app. -->
      <!-- Absent rather than empty when there is nothing to divide: two
           borders with no rows between them read as one thick rule. -->
      @if (rows().length) {
        <ul
          class="divide-y divide-border border-y border-border"
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
    } @else {
      <!-- The narrowings with no column of their own. On a phone they are
           inside the filter panel, which is the one row that screen can spare;
           here they sit above the table they are narrowing. -->
      @if (chips().length) {
        <ul class="mb-4 flex flex-wrap gap-2 text-sm">
          @for (chip of chips(); track chip.label) {
            <li
              class="flex items-center gap-2 rounded-full bg-stone-100 px-3 py-1"
            >
              <span class="text-subtle">{{ chip.label }}</span>
              <span class="font-medium">{{ chip.value }}</span>
              <a
                appIconButton
                variant="danger"
                routerLink="."
                [queryParams]="chip.clearParams"
                queryParamsHandling="merge"
                [attr.aria-label]="chip.clearLabel"
              >
                <app-admin-icon name="x" />
              </a>
            </li>
          }
        </ul>
      }

      <div class="relative">
        <!-- In the margin the heading above already leaves, and out of the
             flow: a link that appeared in the flow when the first column was
             dragged would push the whole table down mid-gesture. -->
        @if (customised()) {
          <div class="absolute right-0 bottom-full">
            <button
              type="button"
              class="cursor-pointer text-xs text-subtle hover:text-accent"
              (click)="resetWidths()"
            >
              {{ common.resetWidths }}
            </button>
          </div>
        }

        <div class="overflow-x-auto">
          <!-- The table renders even with no rows: its header carries the
               filters that produced the empty result, and taking them away with
               the rows would leave nothing to undo them with.

               Cells are padded on the left as well as the right, so a column's
               content keeps clear of the boundary drawn beside it. -->
          <table
            #table
            [style.min-width.px]="minTableWidth()"
            class="w-full text-left text-sm [&_th,&_td]:py-2 [&_th,&_td]:pr-4 [&_th,&_td]:pl-2 [&_th:first-child,&_td:first-child]:pl-0 [&_th:last-child,&_td:last-child]:pr-0"
            [class.table-fixed]="widths()"
            [class.table-auto]="!widths()"
            [attr.aria-busy]="busy() ? 'true' : null"
          >
            <!-- A fixed column asks for its pixels; the rest divide what is
                 left, which is what a percentage means once the pixels are
                 spoken for. -->
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
              <tr class="border-b border-border text-subtle">
                @for (column of columns(); track column.key) {
                  <th
                    #headerCell
                    class="relative font-medium"
                    [class.text-right]="column.align === 'right'"
                  >
                    @if (column.filter; as filter) {
                      <app-grid-filter-select
                        [param]="filter.param"
                        [options]="filter.options"
                        [value]="filter.value"
                        [ariaLabel]="filter.ariaLabel"
                      />
                    } @else if (column.sort; as columnSort) {
                      <app-grid-sort
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

                    <!-- The boundary, not the column: a drag takes width from
                         one side and gives it to the other, so the table stays
                         as wide as the page and the last column never wanders
                         off the right edge. Only between two columns that have
                         a share to trade — a fixed column has nothing to give
                         and the last one has nobody to give it to. -->
                    @if (widths() && handleAt()[$index] >= 0) {
                      <div
                        role="separator"
                        aria-orientation="vertical"
                        tabindex="0"
                        class="group/handle absolute top-0 right-0 z-10 flex h-full w-3 translate-x-1/2 cursor-col-resize touch-none items-stretch justify-center"
                        [attr.aria-label]="resizeLabel(column)"
                        [title]="common.resizeColumn"
                        (pointerdown)="startDrag($event, handleAt()[$index])"
                        (dblclick)="resetWidths()"
                        (keydown)="onHandleKey($event, handleAt()[$index])"
                      >
                        <span
                          class="w-px bg-transparent group-hover/handle:bg-border-strong group-focus/handle:bg-accent"
                        ></span>
                      </div>
                    }
                  </th>
                }
              </tr>
            </thead>
            <tbody class="divide-y divide-stone-100">
              @for (row of rows(); track trackBy()(row)) {
                <!-- A row that is over — deleted, declined, switched off — is
                     greyed, but only its content: the buttons that undo the
                     state are the reason the row is still listed, so they keep
                     their colour. Opacity per cell rather than on the row,
                     because a child cannot undo its parent's. -->
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
      <p class="mt-6 text-muted">{{ emptyMessage() }}</p>
    }
  `,
})
export class AdminGrid<T> {
  private readonly store = inject(GridWidthsStore);
  protected readonly common = inject(ADMIN_TEXT).common;

  /*
   * Both widths are watched, and the input picks between them. A media query
   * cannot be injected once an input is known — this is a constructor-time
   * subscription — and two listeners cost nothing beside the table they decide
   * the shape of.
   */
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
  /** The sort in effect, already resolved — null where no column owns it. */
  readonly sort = input<string | null>(null);
  readonly defaultSort = input<string>(DEFAULT_ADMIN_SORT);
  /** Whether a reload is in flight, for `aria-busy`; the rows on screen stay. */
  readonly busy = input(false);
  /** Which of the two nothings this is — no rows at all, or none that match. */
  readonly emptyMessage = input('');
  /** A row's own classes, where it needs any beyond the muting below. */
  readonly rowClass = input<(row: T) => string>(() => '');
  /**
   * Whether a row is over — a deleted product, a declined order, a switched-off
   * account. Such a row is greyed wherever it appears, since it is still listed
   * but it is not work; the card template applies the same rule itself, because
   * only it knows which part of a card is the body and which is the buttons.
   */
  readonly muted = input<(row: T) => boolean>(() => false);
  /** The narrowings this grid has no column for; shown as chips and counted
   * with the column filters. */
  readonly chips = input<readonly GridChip[]>([]);
  /**
   * Where this grid gives up on columns. `md` for the usual six or seven; `lg`
   * for the few that carry more — the customer list's nine run out of room a
   * whole breakpoint before the others do.
   */
  readonly narrowBelow = input<NarrowBreakpoint>('md');
  /** Whether anything at all narrows the list, the search box included: what
   * decides whether there is a filter to clear. */
  readonly filtered = input(false);
  /** What to call an ordering that belongs to no column — the product grid's
   * relevance ranking. Defaults to the shared wording. */
  readonly defaultSortLabel = input('');

  protected readonly cells =
    contentChild.required<GridRowTemplate<T>>(GridRowTemplate);
  protected readonly card =
    contentChild.required<GridCardTemplate<T>>(GridCardTemplate);

  private readonly table = viewChild<ElementRef<HTMLTableElement>>('table');
  private readonly headerCells =
    viewChildren<ElementRef<HTMLTableCellElement>>('headerCell');

  /**
   * The columns whose width is negotiable, which are the only ones any of this
   * is about: a fixed column takes its pixels and the rest divide the
   * remainder.
   *
   * Compared by value, not by identity: the column list is a computed that is
   * rebuilt whenever a filter's value changes, and a source compared by
   * reference would throw the widths away every time the grid was filtered.
   */
  private readonly keys = computed(
    () => flexibleColumns(this.columns()).map((c) => c.key),
    { equal: (a, b) => a.length === b.length && a.every((k, i) => k === b[i]) },
  );

  /**
   * For each column, the boundary its right edge owns — as an index into the
   * flexible columns — or -1 where it owns none. A boundary is only draggable
   * with a negotiable column on both sides of it.
   */
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

  /**
   * The narrowest this table may be drawn: every column at its minimum. Below
   * that the wrapper scrolls — a percentage cannot say "at least this many
   * pixels", and squeezing seven columns past legibility is not the better
   * answer. Only reached on a tablet-width window; a phone gets records.
   */
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

  /** Null means "not decided yet", which is what puts the table back in the
   * browser's hands for one render so it can be measured. */
  protected readonly widths = signal<GridWidths | null>(null);
  /** Whether what is on screen is the admin's own doing, so there is something
   * to reset. */
  protected readonly customised = signal(false);

  constructor() {
    // Stored widths are read per column set: the customers and staff lists are
    // one component with two of them, and each is remembered separately.
    effect(() => {
      const stored = this.store.load(this.gridId(), this.keys());
      untracked(() => {
        this.widths.set(stored);
        this.customised.set(stored !== null);
      });
    });

    // Measure once the browser has laid out a table with rows in it — a header
    // on its own would size the columns to their headings.
    afterRenderEffect(() => {
      if (this.narrow() || this.widths() !== null) return;
      if (this.rows().length === 0) return;
      const cells = this.headerCells();
      if (cells.length !== this.columns().length) return;
      // Only the negotiable ones, and measured against each other: a fixed
      // column's pixels are not a share of anything.
      const flexible = cells.filter(
        (_, i) => this.columns()[i].fixedWidth === undefined,
      );
      const raw = flexible.map((cell) => cell.nativeElement.offsetWidth);
      // Nothing has been laid out yet — the table is off-screen, or this is a
      // test DOM. Fitting would turn that into a set of minimums and freeze
      // them, which is exactly the guess the measuring exists to avoid.
      if (raw.every((px) => px === 0)) return;

      // Never below what the column declared it needs. A heading holding a
      // filter is a `w-full` select, which contributes nothing to the width the
      // browser derives — so those columns measured as if they had no heading
      // at all, and came out too narrow to read one.
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
    return fillText(this.common.resizeColumnOf, {
      column: column.label ?? column.srLabel ?? column.key,
    });
  }

  /**
   * Pointer capture, so the drag survives the pointer leaving the two-pixel
   * strip it started on — which it does immediately, that being the point.
   */
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

  /** The same boundary, for a keyboard: a separator nobody can reach is a
   * control only half the admins have. */
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
        this.columns().map(columnMinWidth),
      ),
    );
    this.persist();
  }

  /** Forgets the dragged widths and measures the content again — which is what
   * the reset link and a double-click on any boundary both mean. */
  protected resetWidths(): void {
    this.store.clear(this.gridId());
    this.customised.set(false);
    this.widths.set(null);
  }

  private persist(): void {
    const widths = this.widths();
    if (!widths) return;
    this.store.save(this.gridId(), widths);
    this.customised.set(true);
  }
}
