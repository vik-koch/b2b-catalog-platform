import { GridFilterOption } from './grid-filter-select';
import { Glyph } from '../icons/glyph';

/** How a column is ordered: the key each direction writes to `sort`. */
export interface GridSort {
  asc: string;
  desc: string;
  /** A first click sorts descending: for recency, where oldest-first is
   * rarely wanted. */
  descFirst?: boolean;
}

/** A filter that lives in a column's heading, and in the phone's filter sheet. */
export interface GridFilter {
  /** The query parameter it writes. */
  param: string;
  options: readonly GridFilterOption[];
  /** The value in effect; the empty string when unfiltered. */
  value: string;
  /** The control's accessible name in the heading, its label in the panel. */
  label: string;
  /** What a choice writes where one select stands for several parameters;
   * `param` alone otherwise. */
  toParams?: (value: string) => Record<string, string | null>;
}

/** The parameters one choice writes; the empty value clears, not `?x=`. */
export function filterParams(
  filter: Pick<GridFilter, 'param' | 'toParams'>,
  value: string,
): Record<string, string | null> {
  return filter.toParams
    ? filter.toParams(value)
    : { [filter.param]: value || null };
}

/**
 * One grid column as data: a heading on a wide screen, a line in the narrow
 * panel and a stored width all need its identity. Cells are the page's.
 */
export interface GridColumn {
  /** Stable across releases: stored widths are filed under it. */
  key: string;
  /** The heading; none for an actions column. */
  label?: string;
  /** The column's noun for the sort picker, where the heading is a filter's
   * "all" option and would read "All statuses, ascending". */
  sortName?: string;
  /** The accessible name of a column with no visible heading. */
  srLabel?: string;
  sort?: GridSort;
  filter?: GridFilter;
  align?: 'left' | 'right';
  /** How far the boundary beside it may be dragged, in pixels. */
  minWidth?: number;
  /** Exactly this many pixels, always (actions, a thumbnail): never measured,
   * dragged or reset; the rest share what it leaves. */
  fixedWidth?: number;
}

/** Fits a date or a short badge; keeps a heading off three lines. */
export const DEFAULT_MIN_COLUMN_WIDTH = 72;

export function columnMinWidth(column: GridColumn): number {
  return column.minWidth ?? DEFAULT_MIN_COLUMN_WIDTH;
}

/** The columns that are measured, dragged and stored. */
export function flexibleColumns(columns: readonly GridColumn[]): GridColumn[] {
  return columns.filter((column) => column.fixedWidth === undefined);
}

/** What the narrow panel builds its filters from. */
export function filterableColumns(
  columns: readonly GridColumn[],
): GridColumn[] {
  return columns.filter((c) => c.filter);
}

export function sortableColumns(columns: readonly GridColumn[]): GridColumn[] {
  return columns.filter((c) => c.sort);
}

/** A narrowing with no column, shown as a chip with its own way out. */
export interface GridChip {
  /** What kind of narrowing it is. */
  label: string;
  /** What it is narrowed to. */
  value: string;
  /** The parameters that undo it, all null. */
  clearParams: Record<string, null>;
  /** Names the button that undoes it. */
  clearLabel: string;
}

/** Narrowings switched on and off on their own; all that are on must hold. */
export interface GridToggleGroup {
  /** What the group asks, for a screen reader. */
  ariaLabel: string;
  /** The query parameter it writes, as a list. */
  param: string;
  options: readonly GridToggleOption[];
  /** The values in effect. */
  selected: readonly string[];
}

export interface GridToggleOption {
  value: string;
  label: string;
  icon?: Glyph;
}

/** The filters in effect, with and without a column, for the panel's badge. */
export function activeFilterCount(
  columns: readonly GridColumn[],
  chips: readonly GridChip[] = [],
  toggles: readonly GridToggleGroup[] = [],
): number {
  return (
    columns.filter((c) => c.filter && c.filter.value).length +
    chips.length +
    toggles.reduce((sum, group) => sum + group.selected.length, 0)
  );
}
