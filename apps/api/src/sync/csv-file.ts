import { SYNC_MAX_ROWS, SyncFormatCode } from '@b2b-catalog-platform/shared';
import Papa from 'papaparse';

/**
 * Reading a CSV upload as a table, before anybody asks what its columns mean.
 *
 * Everything here is the same question whatever area the file belongs to: is
 * this a CSV at all, does it have a header row, are its columns ones we know,
 * is it within the row bound. What a column *means* is the area's own business
 * and lives in its parser — this file would not know a price from a price list.
 *
 * The dialect is UTF-8 (BOM tolerated), RFC-4180 quoting, a required header
 * row; the delimiter is the one Papaparse finds, so a spreadsheet that writes
 * semicolons or tabs is read as well as a comma-separated one. Guessing at a
 * malformed file is how a sync silently writes nonsense, so anything
 * structurally wrong throws `SyncFormatError` — the whole file is refused —
 * while anything wrong with a single row is the caller's to report as a row
 * error and skip.
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

export interface CsvTable {
  /** Header → cell, one entry per data row, every value trimmed. */
  records: Record<string, string>[];
  /** The header row as written, in file order. */
  headers: string[];
}

/** The file as a table: structurally sound, and nothing more is claimed. */
export function parseCsvFile(text: string): CsvTable {
  // Strip a UTF-8 BOM: Excel writes one, and it would otherwise become part of
  // the first header's name.
  const source = text.replace(/^\uFEFF/, '').trim();
  if (!source) {
    throw new SyncFormatError('file-empty', 'The file is empty');
  }

  const parsed = Papa.parse<Record<string, string>>(source, {
    header: true,
    skipEmptyLines: 'greedy',
    // Values are validated per column by the caller; a global trim is safe and
    // spares every rule from re-doing it.
    transform: (value) => value.trim(),
    transformHeader: (header) => header.trim(),
  });

  // Papaparse recovers from a broken quote rather than failing: it reads to the
  // end of the file looking for the closing mark and hands back one enormous
  // field, silently losing every row after the break. Refuse the file instead —
  // a quote nobody closed is exactly the case where guessing writes nonsense.
  // Field-count mismatches are left alone: a short or long row is ordinary, and
  // the per-column rules already say what they make of it.
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
 * The file's headers, resolved to the names the parser works in.
 *
 * `match` is the area's own question — it turns one header as written into the
 * canonical column it addresses, or null for one nobody recognises. What is
 * shared is what happens to the answers: a *duplicated* column is ambiguous
 * (which one wins?) and a typo'd one is almost certainly a converter bug, so
 * both refuse the file rather than being quietly ignored.
 *
 * Matching is the area's to define but duplication is judged case-insensitively
 * here, because two headers differing only in case address one column whatever
 * the area, and which of them wins is exactly the question this refusal exists
 * to avoid asking.
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

/** The column a file cannot be read without, refused by name where it is
 * missing so the admin is told which one rather than that something is. */
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

/** Reads one canonical column out of a record, whatever the header it arrived
 * under. */
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
