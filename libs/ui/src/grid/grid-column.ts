import { fill } from '../core/fill';
import { Glyph } from '../icons/glyph';
import { GridFilterOption } from './grid-filter-select';

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
  /** The heading holds the fact filter's button: a column with no heading of
   * its own. */
  factsHeading?: boolean;
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
  /** The parameters that undo it: null, or a list without the entry. */
  clearParams: Record<string, readonly string[] | null>;
  /** Names the button that undoes it. */
  clearLabel: string;
}

/**
 * Facts asked either way: each one had, lacking or not asked, all that are
 * asked holding at once. Two list parameters carry it, one per way.
 */
export interface GridFactFilter {
  /** Names the heading's button and the panel it opens. */
  label: string;
  hasParam: string;
  missingParam: string;
  facts: readonly GridFact[];
  /** The values in effect, per way. */
  has: readonly string[];
  missing: readonly string[];
}

export interface GridFact {
  value: string;
  label: string;
  icon?: Glyph;
}

export type GridFactState = 'any' | 'has' | 'missing';

export function factState(
  filter: GridFactFilter,
  value: string,
): GridFactState {
  if (filter.has.includes(value)) return 'has';
  if (filter.missing.includes(value)) return 'missing';
  return 'any';
}

/** Both lists rewritten, so a fact moves between ways in one navigation; an
 * empty list clears its parameter. */
export function factParams(
  filter: GridFactFilter,
  value: string,
  state: GridFactState,
): Record<string, string[] | null> {
  const has = filter.has.filter((v) => v !== value);
  const missing = filter.missing.filter((v) => v !== value);
  if (state === 'has') has.push(value);
  if (state === 'missing') missing.push(value);
  return {
    [filter.hasParam]: has.length ? has : null,
    [filter.missingParam]: missing.length ? missing : null,
  };
}

/** One chip per fact asked, in the filter's order, each undoing only itself. */
export function factChips(
  filter: GridFactFilter | null,
  words: { has: string; missing: string; clearLabel: string },
): GridChip[] {
  if (!filter) return [];
  return filter.facts.flatMap((fact) => {
    const state = factState(filter, fact.value);
    if (state === 'any') return [];
    const way = state === 'has' ? words.has : words.missing;
    return [
      {
        label: way,
        value: fact.label,
        clearParams: factParams(filter, fact.value, 'any'),
        clearLabel: fill(words.clearLabel, { way, fact: fact.label }),
      },
    ];
  });
}

/** The filters in effect, with and without a column, for the panel's badge. */
export function activeFilterCount(
  columns: readonly GridColumn[],
  chips: readonly GridChip[] = [],
): number {
  return (
    columns.filter((c) => c.filter && c.filter.value).length + chips.length
  );
}
