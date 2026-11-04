import {
  CUSTOMER_SYNC_CSV_COLUMNS,
  CUSTOMER_SYNC_FALSE_VALUES,
  CUSTOMER_SYNC_KEY_COLUMN,
  CUSTOMER_SYNC_TRUE_VALUES,
  CustomerSyncCsvColumn,
  CustomerSyncRow,
  CustomerSyncRowError,
  customerSyncRowSchema,
} from '@b2b-catalog-platform/shared/core/exchange';
import {
  canonicalColumns,
  cellReader,
  parseCsvFile,
  requireColumn,
} from './csv-file';

/**
 * CSV → `CustomerSyncRow[]` (FR-ADM-12). Cells are checked by the contract's
 * own row schema, so a file says only what a submission could. Row by row
 * rather than in one go: one mistyped cell skips its row, not the file.
 */

export interface ParsedCustomerSyncRows {
  rows: CustomerSyncRow[];
  errors: CustomerSyncRowError[];
}

/** The columns, spelled as the contract spells its fields. */
const COLUMNS = new Set<string>(CUSTOMER_SYNC_CSV_COLUMNS);

export function parseCustomerSyncCsv(text: string): ParsedCustomerSyncRows {
  const { records, headers } = parseCsvFile(text);
  const canonical = canonicalColumns(
    headers,
    (header) =>
      [...COLUMNS].find(
        (known) => known.toLowerCase() === header.toLowerCase(),
      ) ?? null,
    [...COLUMNS].join(', '),
  );
  requireColumn(canonical, CUSTOMER_SYNC_KEY_COLUMN);

  const rows: CustomerSyncRow[] = [];
  const errors: CustomerSyncRowError[] = [];
  const seen = new Set<string>();

  records.forEach((record, index) => {
    // 1-based, header excluded.
    const row = index + 1;
    const value = cellReader(canonical, record);
    // An empty cell is "not in this file", never "clear this field": a
    // spreadsheet cannot tell the two apart, and only this reading is safe.
    const cell = (column: CustomerSyncCsvColumn): string | undefined => {
      const raw = value(column);
      return raw === undefined || raw === '' ? undefined : raw;
    };

    const sourceId = cell('sourceId');
    if (!sourceId) {
      errors.push({ row, sourceId: null, code: 'missing-source-id' });
      return;
    }
    if (seen.has(sourceId)) {
      errors.push({ row, sourceId, code: 'duplicate-source-id' });
      return;
    }
    seen.add(sourceId);

    // The schema wants a boolean; the file has the word somebody typed.
    const rawLink = cell('sendPasswordLink');
    const sendPasswordLink = readFlag(rawLink);
    if (sendPasswordLink === null) {
      errors.push({
        row,
        sourceId,
        code: 'invalid-value',
        params: { column: 'sendPasswordLink', value: rawLink as string },
      });
      return;
    }

    // Only the cells present, so an absent one is not refused as empty.
    const candidate: Record<string, unknown> = { sourceId, sendPasswordLink };
    for (const column of VALUE_COLUMNS) {
      const raw = cell(column);
      if (raw !== undefined) candidate[column] = raw;
    }

    const parsed = customerSyncRowSchema.safeParse(candidate);
    if (!parsed.success) {
      // The first complaint is enough: the row is skipped whole.
      const issue = parsed.error.issues[0];
      const column = String(issue.path[0] ?? '');
      errors.push({
        row,
        sourceId,
        code: 'invalid-value',
        params: { column, value: String(candidate[column] ?? '') },
      });
      return;
    }

    rows.push(parsed.data);
  });

  return { rows, errors };
}

/** Handed to the schema as written; the key and the flag are read above. */
const VALUE_COLUMNS = CUSTOMER_SYNC_CSV_COLUMNS.filter(
  (column) => column !== 'sourceId' && column !== 'sendPasswordLink',
);

/** A yes/no cell, or null for anything else. Empty is no: no instruction to
 * send a mail is not one. */
function readFlag(raw: string | undefined): boolean | null {
  if (raw === undefined) return false;
  const value = raw.toLowerCase();
  if (CUSTOMER_SYNC_TRUE_VALUES.includes(value)) return true;
  if (CUSTOMER_SYNC_FALSE_VALUES.includes(value)) return false;
  return null;
}
