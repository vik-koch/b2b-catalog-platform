import * as z from 'zod';

import {
  CatalogSyncOptions,
  catalogSyncOptionsSchema,
  CatalogSyncRow,
  CatalogSyncRowError,
  catalogSyncRowErrorSchema,
  catalogSyncRowSchema,
  CustomerSyncOptions,
  customerSyncOptionsSchema,
  CustomerSyncRow,
  CustomerSyncRowError,
  customerSyncRowErrorSchema,
  customerSyncRowSchema,
  SyncArea,
} from '@b2b-catalog-platform/shared/core/exchange';

import { syncRuns } from './exchange-schema';

type RunRow = typeof syncRuns.$inferSelect;

/** A staged run's payload, narrowed by `area`. The row type has one union per
 * staged column, which nothing ties to each other or to the area. */
export type StagedPayload =
  | {
      area: 'catalog';
      rows: CatalogSyncRow[];
      options: CatalogSyncOptions;
      parseErrors: CatalogSyncRowError[];
    }
  | {
      area: 'customers';
      rows: CustomerSyncRow[];
      options: CustomerSyncOptions;
      parseErrors: CustomerSyncRowError[];
    };

/** One area's arm, for an engine that serves only that area. */
export type StagedPayloadOf<A extends SyncArea> = Extract<
  StagedPayload,
  { area: A }
>;

/** A staged column its area's schema refuses. Not a run conflict: the same
 * schema wrote it a day ago at most, so the row was corrupted or hand-edited,
 * and it is a 500 and a log line. */
export class StagedPayloadError extends Error {
  constructor(runId: string, column: string, cause: z.ZodError) {
    super(`Run ${runId}: stored ${column} does not match its area's schema`);
    this.name = 'StagedPayloadError';
    this.cause = cause;
  }
}

/**
 * A run's staged payload, or null once applied, pruned or never staged. Parsed,
 * as jsonb comes back `unknown`; the same schemas wrote it, so the parse
 * changes nothing. `plan` is not parsed: it is history on a screen, and an
 * older release's diff must still show.
 */
export function stagedPayload(run: RunRow): StagedPayload | null {
  if (!run.rows || !run.options) return null;
  const parse = <T>(
    column: string,
    schema: z.ZodType<T>,
    value: unknown,
  ): T => {
    const result = schema.safeParse(value);
    if (!result.success) {
      throw new StagedPayloadError(run.id, column, result.error);
    }
    return result.data;
  };
  // Only an uploaded file has parse errors; a JSON run has none.
  const errors = run.parseErrors ?? [];
  switch (run.area) {
    // An order write-back is applied as it arrives and stages nothing.
    case 'orders':
      return null;
    case 'catalog':
      return {
        area: 'catalog',
        rows: parse('rows', z.array(catalogSyncRowSchema), run.rows),
        options: parse('options', catalogSyncOptionsSchema, run.options),
        parseErrors: parse(
          'parseErrors',
          z.array(catalogSyncRowErrorSchema),
          errors,
        ),
      };
    case 'customers':
      return {
        area: 'customers',
        rows: parse('rows', z.array(customerSyncRowSchema), run.rows),
        options: parse('options', customerSyncOptionsSchema, run.options),
        parseErrors: parse(
          'parseErrors',
          z.array(customerSyncRowErrorSchema),
          errors,
        ),
      };
  }
}
