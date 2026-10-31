import { ProductAttribute } from '@b2b-catalog-platform/shared/core/catalog';

/** Column 0 is the key, 1 the value. */
export interface GridCell {
  row: number;
  col: 0 | 1;
}

/** Inclusive. */
export interface GridRange {
  r0: number;
  c0: number;
  r1: number;
  c1: number;
}

/** Lines are rows, tabs columns. Empty lines go: copied contenteditable cells
 * bring blank lines between rows. */
export function parseClipboardGrid(text: string): string[][] {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/\n$/, '')
    .split('\n')
    .map((line) => line.split('\t'))
    .filter((cols) => cols.some((c) => c.trim() !== ''));
}

/** Fills outward from `start`, as a spreadsheet does, adding rows up to
 * `max`. */
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

/** The copy payload, as TSV. */
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
