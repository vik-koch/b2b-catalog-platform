import {
  CUSTOMER_SYNC_CSV_COLUMNS,
  CUSTOMER_SYNC_FALSE_VALUES,
  CUSTOMER_SYNC_KEY_COLUMN,
  CUSTOMER_SYNC_TRUE_VALUES,
  CustomerSyncCsvColumn,
  CustomerSyncRow,
  CustomerSyncRowError,
  customerSyncRowSchema,
} from '@b2b-catalog-platform/shared';
import {
  canonicalColumns,
  cellReader,
  parseCsvFile,
  requireColumn,
} from './csv-file';

/**
 * CSV → `CustomerSyncRow[]` (FR-ADM-12): the operator's own encoding of the
 * rows a connected system would send (FR-ADM-11).
 *
 * One entry point onto one engine, not a second importer. This file decides
 * nothing about what a row *means* — whether a key is known, whether an
 * address is somebody else's, what `enabled` comes to for this account — all of
 * which is the differ's, as it is for a headless run. What it decides is
 * whether a cell can be read as the field it sits under at all.
 *
 * The cells are checked by the contract's **own row schema** rather than by
 * rules restated here, so the two encodings cannot drift: a file that parses
 * describes exactly what a submission could have said. The one thing the schema
 * cannot do is read a spreadsheet's idea of yes and no, which is done below and
 * then handed to it as a boolean.
 *
 * A bad cell is a `CustomerSyncRowError` and skips its row; the run proceeds.
 * That is the whole reason a file's cells are not simply run through the
 * submission schema in one go: a converter sending malformed JSON has a bug and
 * should be refused outright, while a person with one mistyped cell in six
 * hundred rows should be told which row and have the rest imported.
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
        // Case-insensitively, like the catalog's: a header is the field's name
        // and a spreadsheet is not careful about case.
        (known) => known.toLowerCase() === header.toLowerCase(),
      ) ?? null,
    [...COLUMNS].join(', '),
  );
  requireColumn(canonical, CUSTOMER_SYNC_KEY_COLUMN);

  const rows: CustomerSyncRow[] = [];
  const errors: CustomerSyncRowError[] = [];
  const seen = new Set<string>();

  records.forEach((record, index) => {
    // 1-based, header excluded — what the admin sees in a spreadsheet minus one.
    const row = index + 1;
    const value = cellReader(canonical, record);
    // An empty cell means "not in this file", never "clear this field": a
    // spreadsheet cannot tell the two apart, and of the two readings only this
    // one cannot quietly strip somebody's company off their invoices.
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

    // The one cell the row schema cannot judge for itself: it wants a boolean,
    // and a file has the word somebody typed.
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

    // Everything else goes to the schema exactly as it was written. Only the
    // columns the file actually carries are included, so an absent one stays
    // absent rather than arriving as an empty string the schema would refuse.
    const candidate: Record<string, unknown> = { sourceId, sendPasswordLink };
    for (const column of VALUE_COLUMNS) {
      const raw = cell(column);
      if (raw !== undefined) candidate[column] = raw;
    }

    const parsed = customerSyncRowSchema.safeParse(candidate);
    if (!parsed.success) {
      // The first complaint, named by its column: a row is skipped whole, so
      // listing every bad cell in it would be a longer way of saying the same
      // thing. The value quoted back is the admin's own.
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

/** The columns handed to the row schema as written — everything but the key
 * and the yes/no cell, which are settled above. */
const VALUE_COLUMNS = CUSTOMER_SYNC_CSV_COLUMNS.filter(
  (column) => column !== 'sourceId' && column !== 'sendPasswordLink',
);

/**
 * A yes/no cell, or null where it says something else. An empty cell is no —
 * this column is an instruction to send a mail, and the absence of an
 * instruction is not one.
 */
function readFlag(raw: string | undefined): boolean | null {
  if (raw === undefined) return false;
  const value = raw.toLowerCase();
  if (CUSTOMER_SYNC_TRUE_VALUES.includes(value)) return true;
  if (CUSTOMER_SYNC_FALSE_VALUES.includes(value)) return false;
  return null;
}
