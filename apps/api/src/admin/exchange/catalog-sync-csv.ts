import { parseTaxRate } from '@b2b-catalog-platform/shared/platform';
import {
  DEFAULT_PRICE_LIST_ALIAS,
  CATALOG_SYNC_CSV_COLUMNS,
  CatalogSyncPriceListKey,
  CatalogSyncRow,
  CatalogSyncRowError,
} from '@b2b-catalog-platform/shared/core/exchange';
import {
  canonicalColumns,
  cellReader,
  parseCsvFile,
  requireColumn,
} from './csv-file';

/** CSV → `CatalogSyncRow[]`. Synchronous: a whole catalog is about 1,500
 * rows, so streaming buys nothing. */

export interface ParsedCatalogSyncRows {
  rows: CatalogSyncRow[];
  errors: CatalogSyncRowError[];
}

/** The headers that are always the same, whatever a deployment sells. */
const FIXED_COLUMNS = new Set<string>([
  CATALOG_SYNC_CSV_COLUMNS.sourceId,
  CATALOG_SYNC_CSV_COLUMNS.name,
  CATALOG_SYNC_CSV_COLUMNS.categorySourceId,
  CATALOG_SYNC_CSV_COLUMNS.categoryName,
  CATALOG_SYNC_CSV_COLUMNS.stock,
  CATALOG_SYNC_CSV_COLUMNS.taxRate,
]);

/**
 * The price list a header addresses, or null. Only the shape is settled here;
 * keys are tier rows, so the differ decides whether one names a list. A key
 * keeps its case (the differ matches it against the tiers) and is NFC
 * normalized, since two spellings of a letter look the same in a spreadsheet.
 */
function priceListKeyOf(header: string): CatalogSyncPriceListKey | null {
  const normalized = header.trim().normalize('NFC');
  const lowered = normalized.toLowerCase();
  // A bare `price` is the badged list, so a single-price export needs no key.
  if (lowered === CATALOG_SYNC_CSV_COLUMNS.price)
    return DEFAULT_PRICE_LIST_ALIAS;
  if (!lowered.startsWith(CATALOG_SYNC_CSV_COLUMNS.pricePrefix)) return null;
  const key = normalized.slice(CATALOG_SYNC_CSV_COLUMNS.pricePrefix.length);
  return key === '' ? null : key;
}

export function parseCatalogSyncCsv(text: string): ParsedCatalogSyncRows {
  const { records, headers } = parseCsvFile(text);

  // Header → the price list it writes; the rest of the parser treats these
  // like any other column, keyed by its canonical `price:<key>` name.
  const priceKeys = new Map<string, CatalogSyncPriceListKey>();
  const expected = `${[...FIXED_COLUMNS].join(', ')}, ${
    CATALOG_SYNC_CSV_COLUMNS.price
  }, ${CATALOG_SYNC_CSV_COLUMNS.pricePrefix}<price list>`;
  const canonical = canonicalColumns(
    headers,
    (header) => {
      const fixed = [...FIXED_COLUMNS].find(
        (known) => known.toLowerCase() === header.toLowerCase(),
      );
      if (fixed) return fixed;
      const priceKey = priceListKeyOf(header);
      if (!priceKey) return null;
      const name = `${CATALOG_SYNC_CSV_COLUMNS.pricePrefix}${priceKey}`;
      priceKeys.set(name, priceKey);
      return name;
    },
    expected,
  );
  requireColumn(canonical, CATALOG_SYNC_CSV_COLUMNS.sourceId);

  const rows: CatalogSyncRow[] = [];
  const errors: CatalogSyncRowError[] = [];
  const seen = new Set<string>();

  records.forEach((record, index) => {
    // 1-based, header excluded.
    const rowNumber = index + 1;
    const value = cellReader(canonical, record);

    const sourceId = value(CATALOG_SYNC_CSV_COLUMNS.sourceId) ?? '';
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

    const row: CatalogSyncRow = { sourceId };

    // An empty cell is "not in this file", never "clear this field".
    const name = value(CATALOG_SYNC_CSV_COLUMNS.name);
    if (name) row.name = name;

    // Half of the category pair says nothing usable.
    const categorySourceId = value(CATALOG_SYNC_CSV_COLUMNS.categorySourceId);
    const categoryName = value(CATALOG_SYNC_CSV_COLUMNS.categoryName);
    if (Boolean(categorySourceId) !== Boolean(categoryName)) {
      errors.push({
        row: rowNumber,
        sourceId,
        code: categorySourceId
          ? 'category-id-without-name'
          : 'category-name-without-id',
        params: { category: (categorySourceId || categoryName) as string },
      });
      return;
    }
    if (categorySourceId && categoryName) {
      row.categorySourceId = categorySourceId;
      row.categoryName = categoryName;
    }

    const prices: Record<CatalogSyncPriceListKey, number> = {};
    let priceError: { price: string; column: string } | null = null;
    for (const [column, key] of priceKeys) {
      const raw = value(column);
      if (raw === undefined || raw === '') continue;
      // Minor units: "18.90" is the converter's to resolve.
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

    // Signed: a stocktake correction can leave the figure below zero.
    const stock = value(CATALOG_SYNC_CSV_COLUMNS.stock);
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

    // Unlike stock, an empty cell is a value: the deployment's default rate.
    // A file without the column leaves every rate alone.
    const taxRateCell = value(CATALOG_SYNC_CSV_COLUMNS.taxRate);
    if (taxRateCell !== undefined) {
      const taxRate = parseTaxRate(taxRateCell);
      if (taxRate === undefined) {
        errors.push({
          row: rowNumber,
          sourceId,
          code: 'tax-rate-invalid',
          params: { taxRate: taxRateCell },
        });
        return;
      }
      row.taxRate = taxRate;
    }

    rows.push(row);
  });

  return { rows, errors };
}
