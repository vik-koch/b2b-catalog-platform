import { ProductAttribute } from '@b2b-catalog-platform/shared';

/** A cell coordinate in the attribute grid (two columns: key=0, value=1). */
export interface GridCell {
  row: number;
  col: 0 | 1;
}

/** A rectangular cell range, inclusive. */
export interface GridRange {
  r0: number;
  c0: number;
  r1: number;
  c1: number;
}

/**
 * Parse clipboard text into a grid of cells. Newlines separate rows, tabs
 * separate columns. Wholly-empty lines are dropped — copying contenteditable
 * cells serialises blank lines between rows, which would otherwise become stray
 * empty rows on paste.
 */
export function parseClipboardGrid(text: string): string[][] {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/\n$/, '')
    .split('\n')
    .map((line) => line.split('\t'))
    .filter((cols) => cols.some((c) => c.trim() !== ''));
}

/**
 * Apply a pasted grid onto the rows, filling outward from `start` (Excel-style)
 * and appending empty rows as needed up to `max`. Pure — returns a new array.
 */
export function applyPastedGrid(
  rows: readonly ProductAttribute[],
  start: GridCell,
  grid: readonly string[][],
  max: number,
): ProductAttribute[] {
  const out = rows.map((r) => ({ ...r }));
  grid.forEach((cols, i) => {
    const r = start.row + i;
    while (out.length <= r && out.length < max) {
      out.push({ key: '', value: '' });
    }
    if (r >= out.length) return;
    cols.forEach((val, j) => {
      const c = start.col + j;
      if (c === 0) out[r] = { ...out[r], key: val.trim() };
      else if (c === 1) out[r] = { ...out[r], value: val.trim() };
    });
  });
  return out;
}

/** Serialise a selected rectangle to TSV — the clean copy payload. */
export function selectionToTsv(
  rows: readonly ProductAttribute[],
  range: GridRange,
): string {
  const lines: string[] = [];
  for (let r = range.r0; r <= range.r1 && r < rows.length; r++) {
    const cols: string[] = [];
    if (range.c0 <= 0 && range.c1 >= 0) cols.push(rows[r].key);
    if (range.c0 <= 1 && range.c1 >= 1) cols.push(rows[r].value);
    lines.push(cols.join('\t'));
  }
  return lines.join('\n');
}

/** Clear (blank) every cell in a rectangle. Pure — returns a new array. */
export function clearRange(
  rows: readonly ProductAttribute[],
  range: GridRange,
): ProductAttribute[] {
  const out = rows.map((r) => ({ ...r }));
  for (let r = range.r0; r <= range.r1 && r < out.length; r++) {
    if (range.c0 <= 0 && range.c1 >= 0) out[r] = { ...out[r], key: '' };
    if (range.c0 <= 1 && range.c1 >= 1) out[r] = { ...out[r], value: '' };
  }
  return out;
}
