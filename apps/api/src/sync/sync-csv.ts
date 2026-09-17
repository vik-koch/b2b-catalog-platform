import {
  DEFAULT_PRICE_LIST_ALIAS,
  SYNC_CSV_COLUMNS,
  SyncPriceListKey,
  SyncRow,
  SyncRowError,
} from '@b2b-catalog-platform/shared';
import {
  canonicalColumns,
  cellReader,
  parseCsvFile,
  requireColumn,
} from './csv-file';

/**
 * CSV → `SyncRow[]`. One of the two encodings of the import contract;
 * the JSON encoding needs no parser at all. Pure and synchronous — a
 * complete catalog is a few hundred rows, so streaming buys nothing.
 *
 * What a file has to be to be read at all lives in `csv-file.ts` and is the
 * same for every area; what a column *means* is here. Anything structurally
 * wrong throws `SyncFormatError` (the whole file is refused) while anything
 * wrong with a single row becomes a `SyncRowError` (that row is skipped, the
 * run proceeds).
 */

export interface ParsedSyncRows {
  rows: SyncRow[];
  errors: SyncRowError[];
}

/** The headers that are always the same, whatever a deployment sells. */
const FIXED_COLUMNS = new Set<string>([
  SYNC_CSV_COLUMNS.sourceId,
  SYNC_CSV_COLUMNS.name,
  SYNC_CSV_COLUMNS.categorySourceId,
  SYNC_CSV_COLUMNS.categoryName,
  SYNC_CSV_COLUMNS.stock,
]);

/**
 * The price list a header addresses, or null if it is not a price column.
 *
 * Price columns cannot be enumerated here: their keys are `customer_tiers`
 * rows, which differ per deployment and change without a release (ADR 0031).
 * So the parser settles the *shape* — `price` or `price:<key>` — and the
 * validator, which can see the database, decides whether the key names a list.
 *
 * The key keeps the case it was written in — keys may be mixed-case, and in
 * scripts whose case-folding a database and a JavaScript engine do not agree
 * on, so the *matching* is done once, against the tier list, by the differ.
 * What is settled here is that `price:Wholesale` and `price:wholesale` are the
 * duplicate they are, and that a key is NFC-normalized: two spellings of the
 * same letter look identical in a spreadsheet and would otherwise address
 * different lists.
 */
function priceListKeyOf(header: string): SyncPriceListKey | null {
  const normalized = header.trim().normalize('NFC');
  const lowered = normalized.toLowerCase();
  // A bare `price` is the alias for the badged list, so a single-price export
  // stays readable in a spreadsheet and needs no knowledge of its name.
  if (lowered === SYNC_CSV_COLUMNS.price) return DEFAULT_PRICE_LIST_ALIAS;
  if (!lowered.startsWith(SYNC_CSV_COLUMNS.pricePrefix)) return null;
  const key = normalized.slice(SYNC_CSV_COLUMNS.pricePrefix.length);
  return key === '' ? null : key;
}

export function parseSyncCsv(text: string): ParsedSyncRows {
  const { records, headers } = parseCsvFile(text);

  // Header → the price list it writes; the rest of the parser treats these
  // like any other column, keyed by its canonical `price:<key>` name.
  const priceKeys = new Map<string, SyncPriceListKey>();
  const expected = `${[...FIXED_COLUMNS].join(', ')}, ${
    SYNC_CSV_COLUMNS.price
  }, ${SYNC_CSV_COLUMNS.pricePrefix}<price list>`;
  const canonical = canonicalColumns(
    headers,
    (header) => {
      // Header names are matched case-insensitively; a key keeps the case it
      // was written in, because the *matching* of a key to a price list is done
      // once, against the tier list, by the differ.
      const fixed = [...FIXED_COLUMNS].find(
        (known) => known.toLowerCase() === header.toLowerCase(),
      );
      if (fixed) return fixed;
      const priceKey = priceListKeyOf(header);
      if (!priceKey) return null;
      const name = `${SYNC_CSV_COLUMNS.pricePrefix}${priceKey}`;
      priceKeys.set(name, priceKey);
      return name;
    },
    expected,
  );
  requireColumn(canonical, SYNC_CSV_COLUMNS.sourceId);

  const rows: SyncRow[] = [];
  const errors: SyncRowError[] = [];
  const seen = new Set<string>();

  records.forEach((record, index) => {
    // 1-based, header excluded — what the admin sees in a spreadsheet minus one.
    const rowNumber = index + 1;
    const value = cellReader(canonical, record);

    const sourceId = value(SYNC_CSV_COLUMNS.sourceId) ?? '';
    if (!sourceId) {
      errors.push({
        row: rowNumber,
        sourceId: null,
        code: 'missing-source-id',
      });
      return;
    }
    if (seen.has(sourceId)) {
      errors.push({ row: rowNumber, sourceId, code: 'duplicate-source-id' });
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
        code: categorySourceId
          ? 'category-id-without-name'
          : 'category-name-without-id',
        // The half that *is* there — the other one is what is missing.
        params: { category: (categorySourceId || categoryName) as string },
      });
      return;
    }
    if (categorySourceId && categoryName) {
      row.categorySourceId = categorySourceId;
      row.categoryName = categoryName;
    }

    const prices: Record<SyncPriceListKey, number> = {};
    let priceError: { price: string; column: string } | null = null;
    for (const [column, key] of priceKeys) {
      const raw = value(column);
      if (raw === undefined || raw === '') continue;
      // Minor units, so an integer: the API is currency-agnostic and does no
      // decimal scaling (ADR 0026) — "18.90" is the converter's job to resolve.
      if (!/^\d+$/.test(raw)) {
        priceError = { price: raw, column };
        break;
      }
      prices[key] = Number(raw);
    }
    if (priceError) {
      errors.push({
        row: rowNumber,
        sourceId,
        code: 'price-not-an-integer',
        params: priceError,
      });
      return;
    }
    if (Object.keys(prices).length > 0) row.prices = prices;

    // Pieces, so a plain integer — and a signed one: a stocktake correction can
    // leave the figure below zero, which reads as none in stock rather than as
    // a bad cell. An empty cell is "not in this file", like every other column.
    const stock = value(SYNC_CSV_COLUMNS.stock);
    if (stock !== undefined && stock !== '') {
      if (!/^-?\d+$/.test(stock)) {
        errors.push({
          row: rowNumber,
          sourceId,
          code: 'stock-not-an-integer',
          params: { stock },
        });
        return;
      }
      row.stockPieces = Number(stock);
    }

    rows.push(row);
  });

  return { rows, errors };
}
