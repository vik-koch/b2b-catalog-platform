import { inject, Injectable, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

/**
 * The column widths an admin dragged, per grid (FR-ADM-05).
 *
 * localStorage rather than a cookie, which is where the catalogue's layout
 * preference lives: that one is a cookie because the listing is server-rendered
 * and the layout is markup, so the server has to know it before the first
 * paint. Every admin screen is client-rendered, so there is no server pass to
 * inform and nothing to gain from sending these to it on every request.
 *
 * Stored as **fractions of the table's width**, not pixels: the same grid is
 * read on a laptop and on a wide monitor, and a column pinned to 380px would be
 * two thirds of the one and a quarter of the other.
 */
export const GRID_WIDTHS_KEY = 'admin_grid_widths';

/** Bumped when the stored shape changes; anything else is dropped rather than
 * migrated — a column width is not worth a migration. */
const VERSION = 1;

export type GridWidths = Record<string, number>;

interface StoredFile {
  v: number;
  grids: Record<string, GridWidths>;
}

/**
 * The widths for one grid, or null where there are none to use.
 *
 * Null rather than a partial answer whenever the stored keys are not exactly
 * this grid's: a release that adds or renames a column leaves widths that no
 * longer describe the table, and re-measuring gives a better answer than
 * guessing at the missing one. The customers and staff lists are the everyday
 * case — one component, two column sets, two entries.
 */
export function readGridWidths(
  raw: string | null,
  gridId: string,
  keys: readonly string[],
): GridWidths | null {
  const stored = parse(raw)?.grids[gridId];
  if (!stored) return null;

  const storedKeys = Object.keys(stored);
  if (storedKeys.length !== keys.length) return null;
  if (!keys.every((key) => typeof stored[key] === 'number')) return null;

  const total = keys.reduce((sum, key) => sum + stored[key], 0);
  if (!Number.isFinite(total) || total <= 0) return null;
  if (keys.some((key) => !(stored[key] > 0))) return null;

  // Normalised on the way out, so a hand-edited file cannot make a table
  // narrower or wider than the space it has.
  return Object.fromEntries(keys.map((key) => [key, stored[key] / total]));
}

/** The file with one grid's widths replaced, or removed where they are null. */
export function writeGridWidths(
  raw: string | null,
  gridId: string,
  widths: GridWidths | null,
): string {
  const file = parse(raw) ?? { v: VERSION, grids: {} };
  if (widths) file.grids[gridId] = widths;
  else delete file.grids[gridId];
  return JSON.stringify(file);
}

function parse(raw: string | null): StoredFile | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const file = parsed as Partial<StoredFile>;
    if (file.v !== VERSION || !file.grids || typeof file.grids !== 'object') {
      return null;
    }
    return { v: VERSION, grids: file.grids };
  } catch {
    return null;
  }
}

@Injectable({ providedIn: 'root' })
export class GridWidthsStore {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  load(gridId: string, keys: readonly string[]): GridWidths | null {
    return readGridWidths(this.raw(), gridId, keys);
  }

  save(gridId: string, widths: GridWidths): void {
    this.write(writeGridWidths(this.raw(), gridId, widths));
  }

  clear(gridId: string): void {
    this.write(writeGridWidths(this.raw(), gridId, null));
  }

  /** Every access is guarded: storage throws outright where a browser is set
   * to block site data, and a column width is not worth a broken grid. */
  private raw(): string | null {
    if (!this.isBrowser) return null;
    try {
      return localStorage.getItem(GRID_WIDTHS_KEY);
    } catch {
      return null;
    }
  }

  private write(value: string): void {
    if (!this.isBrowser) return;
    try {
      localStorage.setItem(GRID_WIDTHS_KEY, value);
    } catch {
      /* full or blocked: the widths simply do not outlive the page */
    }
  }
}
