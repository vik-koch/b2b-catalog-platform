import { GridFilterOption } from './grid-filter-select';

/** How a column is ordered: the key each direction writes to `sort`. */
export interface GridSort {
  asc: string;
  desc: string;
  /**
   * Which direction a first click takes. Ascending everywhere except recency,
   * where oldest-first is a step nobody wants.
   */
  descFirst?: boolean;
}

/** A filter that lives in a column's heading, and in the phone's filter sheet. */
export interface GridFilter {
  /** The query parameter it writes. */
  param: string;
  options: readonly GridFilterOption[];
  /** The value in effect; the empty string when unfiltered. */
  value: string;
  /** Names the control, since the heading it replaces carries no text. */
  ariaLabel: string;
}

/**
 * One column of an admin grid, declared as data rather than as markup.
 *
 * The heading was the only place a column existed before, which is why the
 * phone lost the filters with the table: a `<select>` inside a `<th>` is only
 * reachable where there is a table to put it in. Declared here, the same column
 * can be a heading on a desktop, a line in a filter sheet on a phone, and an
 * entry in the stored widths — each of which needs the column's *identity*, and
 * only one of which is a `<th>`.
 *
 * The cell itself is still the page's: an `<ng-template appGridCell>` per key.
 */
export interface GridColumn {
  /** Stable across releases — it is what a stored width is filed under. */
  key: string;
  /** The heading. Omitted for a column that holds row actions. */
  label?: string;
  /**
   * The column's own noun, where the heading is not one. A filtered column is
   * headed by its "all" option — "All statuses" — which names the column on a
   * desktop but reads as an ordering in the phone's sort picker ("All statuses,
   * ascending"). Defaults to the heading.
   */
  sortName?: string;
  /** The accessible name of a column with no visible heading. */
  srLabel?: string;
  sort?: GridSort;
  filter?: GridFilter;
  align?: 'left' | 'right';
  /** How far the boundary beside it may be dragged, in pixels. */
  minWidth?: number;
  /**
   * A column that is exactly this many pixels wide, always.
   *
   * For the columns whose width is not a matter of taste: a row's action
   * buttons and a thumbnail need what they need and nothing more, and a share
   * of the table is the wrong way to describe either. Such a column is left out
   * of the measuring, out of the dragging (a boundary it touches has nothing to
   * negotiate) and out of a reset — the rest of the table shares what it leaves.
   */
  fixedWidth?: number;
}

/** Narrow enough for a date or a short badge, wide enough to keep a heading
 * from wrapping to three lines. */
export const DEFAULT_MIN_COLUMN_WIDTH = 72;

export function columnMinWidth(column: GridColumn): number {
  return column.minWidth ?? DEFAULT_MIN_COLUMN_WIDTH;
}

/** The columns that share what the fixed ones leave — the only ones there is
 * anything to measure, drag or store. */
export function flexibleColumns(columns: readonly GridColumn[]): GridColumn[] {
  return columns.filter((column) => column.fixedWidth === undefined);
}

/** The columns a phone can filter or sort by — what the filter sheet and the
 * sort select are built from, so neither can name a column the grid lost. */
export function filterableColumns(
  columns: readonly GridColumn[],
): GridColumn[] {
  return columns.filter((c) => c.filter);
}

export function sortableColumns(columns: readonly GridColumn[]): GridColumn[] {
  return columns.filter((c) => c.sort);
}

/**
 * A filter with no column to live in — the product grid is reached from the
 * attribute inventory and from the tier list, each carrying a narrowing the
 * table has no heading for. Shown as a chip that says what it is doing and
 * carries its own way out.
 */
export interface GridChip {
  /** What kind of narrowing this is: "Attribute", "Price list". */
  label: string;
  /** What it is narrowed to. */
  value: string;
  /** The parameters that undo it, all null. */
  clearParams: Record<string, null>;
  /** Names the button that undoes it. */
  clearLabel: string;
}

/** How many filters are narrowing the grid, for the disclosure's badge — the
 * ones in column headings and the ones with no column, which narrow the list
 * exactly as much. */
export function activeFilterCount(
  columns: readonly GridColumn[],
  chips: readonly GridChip[] = [],
): number {
  return (
    columns.filter((c) => c.filter && c.filter.value).length + chips.length
  );
}
