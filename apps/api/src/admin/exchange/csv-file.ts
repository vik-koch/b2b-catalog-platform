import Papa from 'papaparse';

import { SyncFormatCode } from '@b2b-catalog-platform/shared/admin/exchange';
import { SYNC_MAX_ROWS } from '@b2b-catalog-platform/shared/core/exchange';

/**
 * A CSV upload as a table, whatever its area: UTF-8 (BOM tolerated), RFC 4180
 * quoting, a header row, the delimiter Papaparse finds. Anything structurally
 * wrong refuses the whole file, since guessing is how a sync writes nonsense;
 * a bad row is the area parser's to report and skip.
 */

/** The file as a whole is unusable. */
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

export interface CsvTable {
  /** Header → cell, one entry per data row, every value trimmed. */
  records: Record<string, string>[];
  /** The header row as written, in file order. */
  headers: string[];
}

/** The file as a table: structurally sound, and nothing more is claimed. */
export function parseCsvFile(text: string): CsvTable {
  // Excel writes a BOM, which would otherwise join the first header's name.
  const source = text.replace(/^\uFEFF/, '').trim();
  if (!source) {
    throw new SyncFormatError('file-empty', 'The file is empty');
  }

  const parsed = Papa.parse<Record<string, string>>(source, {
    header: true,
    skipEmptyLines: 'greedy',
    transform: (value) => value.trim(),
    transformHeader: (header) => header.trim(),
  });

  // Papaparse recovers from an unclosed quote by reading to the end as one
  // field, silently losing every row after it. A short or long row is
  // ordinary, so field-count errors are left alone.
  const quoteError = parsed.errors.find((error) => error.type === 'Quotes');
  if (quoteError) {
    // Papa counts data rows from zero; +2 is the line an editor shows.
    const line = String((quoteError.row ?? 0) + 2);
    throw new SyncFormatError(
      'malformed-quotes',
      `Unclosed quote at line ${line}`,
      { row: line },
    );
  }

  const headers = parsed.meta.fields ?? [];
  if (headers.length === 0) {
    throw new SyncFormatError('no-header-row', 'The file has no header row');
  }

  if (parsed.data.length > SYNC_MAX_ROWS) {
    throw new SyncFormatError(
      'too-many-rows',
      `The file has ${parsed.data.length} rows; the limit is ${SYNC_MAX_ROWS}`,
      { rows: String(parsed.data.length), limit: String(SYNC_MAX_ROWS) },
    );
  }

  return { records: parsed.data, headers };
}

/**
 * Header as written → canonical column, by the area's `match`. A duplicated
 * column (judged case-insensitively) is ambiguous and an unknown one is
 * almost certainly a converter bug, so both refuse the file.
 */
export function canonicalColumns(
  headers: string[],
  match: (header: string) => string | null,
  expected: string,
): Map<string, string> {
  const canonical = new Map<string, string>();
  const unknown: string[] = [];

  for (const header of headers) {
    const name = match(header);
    if (!name) {
      unknown.push(header);
      continue;
    }
    if (
      [...canonical.values()].some(
        (taken) => taken.toLowerCase() === name.toLowerCase(),
      )
    ) {
      throw new SyncFormatError(
        'duplicate-column',
        `Duplicate column "${name}"`,
        { column: name },
      );
    }
    canonical.set(header, name);
  }

  if (unknown.length > 0) {
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

  return canonical;
}

/** Refuses a file without `column`, naming it. */
export function requireColumn(
  canonical: Map<string, string>,
  column: string,
): void {
  if (![...canonical.values()].includes(column)) {
    throw new SyncFormatError(
      'missing-required-column',
      `Missing the required "${column}" column`,
      { column },
    );
  }
}

/** Reads a canonical column out of a record, whatever its header. */
export function cellReader(
  canonical: Map<string, string>,
  record: Record<string, string>,
): (column: string) => string | undefined {
  return (column) => {
    for (const [header, name] of canonical) {
      if (name === column) return record[header];
    }
    return undefined;
  };
}
