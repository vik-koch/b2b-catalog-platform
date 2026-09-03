import Papa from 'papaparse';
import {
  DEFAULT_PRICE_LIST_KEY,
  SYNC_CSV_COLUMNS,
  SYNC_MAX_ROWS,
  SyncFormatCode,
  SyncPriceListKey,
  SyncRow,
  SyncRowError,
} from '@b2b-catalog-platform/shared';

/**
 * CSV → `SyncRow[]`. One of the two encodings of the import contract;
 * the JSON encoding needs no parser at all. Pure and synchronous — a
 * complete catalog is a few hundred rows, so streaming buys nothing.
 *
 * The dialect is UTF-8 (BOM tolerated), RFC-4180 quoting, a required header
 * row; the delimiter is the one Papaparse finds, so a spreadsheet that writes
 * semicolons or tabs is read as well as a comma-separated one. Guessing at a malformed file is how
 * a sync silently writes nonsense, so anything structurally wrong throws
 * `SyncFormatError` (the whole file is refused) while anything wrong with a
 * single row becomes a `SyncRowError` (that row is skipped, the run proceeds).
 */

/** The file as a whole is unusable — no header, wrong columns, not CSV. */
export class SyncFormatError extends Error {
  constructor(
    readonly code: SyncFormatCode,
    message: string,
    /** Names from the admin's own file, for their wording to substitute. */
    readonly params?: Record<string, string>,
  ) {
    super(message);
  }
}

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
 * Keys are lowercased because that is the only form a tier key can take, which
 * also makes `price:Wholesale` and `price:wholesale` the duplicate they are.
 */
function priceListKeyOf(header: string): SyncPriceListKey | null {
  const normalized = header.trim().toLowerCase();
  // A bare `price` is the alias for the base list, so a single-price export
  // stays readable in a spreadsheet.
  if (normalized === SYNC_CSV_COLUMNS.price) return DEFAULT_PRICE_LIST_KEY;
  if (!normalized.startsWith(SYNC_CSV_COLUMNS.pricePrefix)) return null;
  const key = normalized.slice(SYNC_CSV_COLUMNS.pricePrefix.length);
  return key === '' ? null : key;
}

export function parseSyncCsv(text: string): ParsedSyncRows {
  // Strip a UTF-8 BOM: Excel writes one, and it would otherwise become part of
  // the first header's name.
  const source = text.replace(/^\uFEFF/, '').trim();
  if (!source) {
    throw new SyncFormatError('file-empty', 'The file is empty');
  }

  const parsed = Papa.parse<Record<string, string>>(source, {
    header: true,
    skipEmptyLines: 'greedy',
    // Values are validated per column below; a global trim is safe and spares
    // every rule from re-doing it.
    transform: (value) => value.trim(),
    transformHeader: (header) => header.trim(),
  });

  // Papaparse recovers from a broken quote rather than failing: it reads to the
  // end of the file looking for the closing mark and hands back one enormous
  // field, silently losing every row after the break. Refuse the file instead —
  // a quote nobody closed is exactly the case where guessing writes nonsense.
  // Field-count mismatches are left alone: a short or long row is ordinary, and
  // the per-column rules below already say what they make of it.
  const quoteError = parsed.errors.find((error) => error.type === 'Quotes');
  if (quoteError) {
    // Papa counts data rows from zero and excludes the header; +2 makes it the
    // line number a spreadsheet or an editor shows.
    const line = String((quoteError.row ?? 0) + 2);
    throw new SyncFormatError(
      'malformed-quotes',
      `Unclosed quote at line ${line}`,
      { row: line },
    );
  }

  const headers = (parsed.meta.fields ?? []).map((h) => h);
  if (headers.length === 0) {
    throw new SyncFormatError('no-header-row', 'The file has no header row');
  }

  // Header names are matched case-insensitively, but a *duplicated* column is
  // ambiguous (which one wins?) and a typo'd one is almost certainly a
  // converter bug — both are refused rather than ignored.
  const canonical = new Map<string, string>();
  // Header → the price list it writes; the rest of the parser treats these
  // like any other column, keyed by its canonical `price:<key>` name.
  const priceKeys = new Map<string, SyncPriceListKey>();
  const unknown: string[] = [];
  for (const header of headers) {
    const fixed = [...FIXED_COLUMNS].find(
      (known) => known.toLowerCase() === header.toLowerCase(),
    );
    const priceKey = fixed ? null : priceListKeyOf(header);
    const match =
      fixed ?? (priceKey ? `${SYNC_CSV_COLUMNS.pricePrefix}${priceKey}` : null);
    if (!match) {
      unknown.push(header);
      continue;
    }
    if ([...canonical.values()].includes(match)) {
      throw new SyncFormatError(
        'duplicate-column',
        `Duplicate column "${match}"`,
        { column: match },
      );
    }
    canonical.set(header, match);
    if (priceKey) priceKeys.set(match, priceKey);
  }
  if (unknown.length > 0) {
    const expected = `${[...FIXED_COLUMNS].join(', ')}, ${
      SYNC_CSV_COLUMNS.price
    }, ${SYNC_CSV_COLUMNS.pricePrefix}<price list>`;
    throw new SyncFormatError(
      'unknown-columns',
      `Unknown columns ${unknown.join(', ')} — expected any of ${expected}`,
      {
        columns: unknown.map((u) => `"${u}"`).join(', '),
        count: String(unknown.length),
        expected,
      },
    );
  }
  if (![...canonical.values()].includes(SYNC_CSV_COLUMNS.sourceId)) {
    throw new SyncFormatError(
      'missing-required-column',
      `Missing the required "${SYNC_CSV_COLUMNS.sourceId}" column`,
      { column: SYNC_CSV_COLUMNS.sourceId },
    );
  }

  const data = parsed.data;
  if (data.length > SYNC_MAX_ROWS) {
    throw new SyncFormatError(
      'too-many-rows',
      `The file has ${data.length} rows; the limit is ${SYNC_MAX_ROWS}`,
      { rows: String(data.length), limit: String(SYNC_MAX_ROWS) },
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
