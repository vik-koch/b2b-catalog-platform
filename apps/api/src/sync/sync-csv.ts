import Papa from 'papaparse';
import {
  SYNC_CSV_COLUMNS,
  SYNC_MAX_ROWS,
  SYNC_PRICE_LIST_KEYS,
  SyncPriceListKey,
  SyncRow,
  SyncRowError,
  syncPriceColumn,
} from '@b2b-catalog-platform/shared';

/**
 * CSV → `SyncRow[]`. One of the two encodings of the import contract;
 * the JSON encoding needs no parser at all. Pure and synchronous — a
 * complete catalog is a few hundred rows, so streaming buys nothing.
 *
 * The dialect is pinned rather than sniffed: UTF-8 (BOM tolerated), `,`,
 * RFC-4180 quoting, a required header row. Guessing at a malformed file is how
 * a sync silently writes nonsense, so anything structurally wrong throws
 * `SyncFormatError` (the whole file is refused) while anything wrong with a
 * single row becomes a `SyncRowError` (that row is skipped, the run proceeds).
 */

/** The file as a whole is unusable — no header, wrong columns, not CSV. */
export class SyncFormatError extends Error {}

export interface ParsedSyncRows {
  rows: SyncRow[];
  errors: SyncRowError[];
}

/** Every header the parser accepts, matched case-insensitively. */
const PRICE_COLUMNS = new Map<string, SyncPriceListKey>([
  // A bare `price` is the alias for the default list, so a single-price export
  // stays readable in a spreadsheet.
  [SYNC_CSV_COLUMNS.price, 'default'],
  ...SYNC_PRICE_LIST_KEYS.map(
    (key) => [syncPriceColumn(key), key] as [string, SyncPriceListKey],
  ),
]);

const KNOWN_COLUMNS = new Set<string>([
  SYNC_CSV_COLUMNS.sourceId,
  SYNC_CSV_COLUMNS.name,
  SYNC_CSV_COLUMNS.categorySourceId,
  SYNC_CSV_COLUMNS.categoryName,
  ...PRICE_COLUMNS.keys(),
]);

export function parseSyncCsv(text: string): ParsedSyncRows {
  // Strip a UTF-8 BOM: Excel writes one, and it would otherwise become part of
  // the first header's name.
  const source = text.replace(/^\uFEFF/, '').trim();
  if (!source) {
    throw new SyncFormatError('The file is empty');
  }

  const parsed = Papa.parse<Record<string, string>>(source, {
    header: true,
    skipEmptyLines: 'greedy',
    // Values are validated per column below; a global trim is safe and spares
    // every rule from re-doing it.
    transform: (value) => value.trim(),
    transformHeader: (header) => header.trim(),
  });

  const headers = (parsed.meta.fields ?? []).map((h) => h);
  if (headers.length === 0) {
    throw new SyncFormatError('The file has no header row');
  }

  // Header names are matched case-insensitively, but a *duplicated* column is
  // ambiguous (which one wins?) and a typo'd one is almost certainly a
  // converter bug — both are refused rather than ignored.
  const canonical = new Map<string, string>();
  const unknown: string[] = [];
  for (const header of headers) {
    const match = [...KNOWN_COLUMNS].find(
      (known) => known.toLowerCase() === header.toLowerCase(),
    );
    if (!match) {
      unknown.push(header);
      continue;
    }
    if ([...canonical.values()].includes(match)) {
      throw new SyncFormatError(`Duplicate column "${match}"`);
    }
    canonical.set(header, match);
  }
  if (unknown.length > 0) {
    throw new SyncFormatError(
      `Unknown column${unknown.length > 1 ? 's' : ''} ${unknown
        .map((u) => `"${u}"`)
        .join(', ')} — expected any of ${[...KNOWN_COLUMNS].join(', ')}`,
    );
  }
  if (![...canonical.values()].includes(SYNC_CSV_COLUMNS.sourceId)) {
    throw new SyncFormatError(
      `Missing the required "${SYNC_CSV_COLUMNS.sourceId}" column`,
    );
  }

  const data = parsed.data;
  if (data.length > SYNC_MAX_ROWS) {
    throw new SyncFormatError(
      `The file has ${data.length} rows; the limit is ${SYNC_MAX_ROWS}`,
    );
  }

  const rows: SyncRow[] = [];
  const errors: SyncRowError[] = [];
  const seen = new Set<string>();

  data.forEach((record, index) => {
    // 1-based, header excluded — what the admin sees in a spreadsheet minus one.
    const rowNumber = index + 1;
    const value = (column: string): string | undefined => {
      for (const [header, name] of canonical) {
        if (name === column) return record[header];
      }
      return undefined;
    };

    const sourceId = value(SYNC_CSV_COLUMNS.sourceId) ?? '';
    if (!sourceId) {
      errors.push({
        row: rowNumber,
        sourceId: null,
        message: 'Missing sourceId',
      });
      return;
    }
    if (seen.has(sourceId)) {
      errors.push({
        row: rowNumber,
        sourceId,
        message: 'Duplicate sourceId in this file',
      });
      return;
    }
    seen.add(sourceId);

    const row: SyncRow = { sourceId };

    // An empty cell means "not in this file", never "clear this field" — a
    // sync can set a value or leave it alone, never blank it.
    const name = value(SYNC_CSV_COLUMNS.name);
    if (name) row.name = name;

    // A category is identified by its own source id and named by the file;
    // half of that pair says nothing usable, so it is a row error rather than
    // a silently ignored cell.
    const categorySourceId = value(SYNC_CSV_COLUMNS.categorySourceId);
    const categoryName = value(SYNC_CSV_COLUMNS.categoryName);
    if (Boolean(categorySourceId) !== Boolean(categoryName)) {
      errors.push({
        row: rowNumber,
        sourceId,
        message: categorySourceId
          ? `Category "${categorySourceId}" has no ${SYNC_CSV_COLUMNS.categoryName}`
          : `Category "${categoryName}" has no ${SYNC_CSV_COLUMNS.categorySourceId}`,
      });
      return;
    }
    if (categorySourceId && categoryName) {
      row.categorySourceId = categorySourceId;
      row.categoryName = categoryName;
    }

    const prices: Partial<Record<SyncPriceListKey, number>> = {};
    let priceError: string | null = null;
    for (const [column, key] of PRICE_COLUMNS) {
      const raw = value(column);
      if (raw === undefined || raw === '') continue;
      // Minor units, so an integer: the API is currency-agnostic and does no
      // decimal scaling (ADR 0026) — "18.90" is the converter's job to resolve.
      if (!/^\d+$/.test(raw)) {
        priceError = `Price "${raw}" in column "${column}" is not a whole number of minor units`;
        break;
      }
      prices[key] = Number(raw);
    }
    if (priceError) {
      errors.push({ row: rowNumber, sourceId, message: priceError });
      return;
    }
    if (Object.keys(prices).length > 0) row.prices = prices;

    rows.push(row);
  });

  return { rows, errors };
}
