import { inject, Injectable, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

/**
 * Dragged column widths, per grid (FR-ADM-05), in localStorage: the grids are
 * client-rendered, so no server needs them. Stored as fractions of the table,
 * not pixels, so a laptop and a wide monitor agree.
 */
export const GRID_WIDTHS_KEY = 'admin_grid_widths';

/** Bumped when the shape changes; older data is dropped, not migrated. */
const VERSION = 1;

export type GridWidths = Record<string, number>;

interface StoredFile {
  v: number;
  grids: Record<string, GridWidths>;
}

/**
 * One grid's widths, or null unless the stored keys are exactly its columns: a
 * release that changed a column re-measures rather than guess.
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

  /** Guarded: storage throws where site data is blocked. */
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
