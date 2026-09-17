import * as z from 'zod';
import {
  CustomerSyncOptions,
  CustomerSyncRow,
  CustomerSyncRowError,
  SyncArea,
  SyncOptions,
  SyncRow,
  SyncRowError,
  customerSyncOptionsSchema,
  customerSyncRowErrorSchema,
  customerSyncRowSchema,
  syncOptionsSchema,
  syncRowErrorSchema,
  syncRowSchema,
} from '@b2b-catalog-platform/shared';
import { syncRuns } from '../db/schema';

type RunRow = typeof syncRuns.$inferSelect;

/**
 * A staged run's payload, narrowed to the area it belongs to.
 *
 * The three staged columns are one union per column in the row type, which
 * means nothing correlates them to each other or to `area`: every reader had
 * to assert its way back to the shape it knew it was looking at. This is that
 * assertion, made once and checked — `area` is a real discriminant here, so a
 * caller writes `if (payload.area === 'catalog')` and the rest follows.
 */
export type StagedPayload =
  | {
      area: 'catalog';
      rows: SyncRow[];
      options: SyncOptions;
      parseErrors: SyncRowError[];
    }
  | {
      area: 'customers';
      rows: CustomerSyncRow[];
      options: CustomerSyncOptions;
      parseErrors: CustomerSyncRowError[];
    };

/** One area's arm of the union, for a signature that takes only that area's
 * staged payload — an engine that serves one area states which it is. */
export type StagedPayloadOf<A extends SyncArea> = Extract<
  StagedPayload,
  { area: A }
>;

/**
 * A staged column that came back from the database in a shape its area's
 * schema does not accept.
 *
 * Deliberately not one of the run conflicts a caller is told about: those name
 * states a run can legitimately be in, and this is not one of them. Staged rows
 * are written by the same schema that reads them here and live a day at most,
 * so failing this means the row was corrupted or hand-edited — a 500 and a log
 * line, not a sentence in the admin panel telling somebody a story that is not
 * true.
 */
export class StagedPayloadError extends Error {
  constructor(runId: string, column: string, cause: z.ZodError) {
    super(`Run ${runId}: stored ${column} does not match its area's schema`);
    this.name = 'StagedPayloadError';
    this.cause = cause;
  }
}

/**
 * The staged payload of a run, or null where there is none to read — a run
 * that has been applied, was pruned, or never staged anything.
 *
 * Parsed rather than asserted, because jsonb read back from Postgres is
 * `unknown` however it was typed going in. The parse is idempotent: these rows
 * were validated by these schemas at submission, so it re-applies the same
 * defaults and trims to the same values, and its real job is to be the one
 * place that says which shapes an area's run holds.
 *
 * Only what is acted on is parsed. `plan` is not: it is finished history shown
 * on a screen, and a stored diff from an older release that no longer satisfies
 * today's schema should read as the record it is, not fail the page.
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
  // The staged errors default to none: a run submitted as JSON has no parse
  // errors at all, and only an uploaded file can carry any.
  const errors = run.parseErrors ?? [];
  switch (run.area) {
    case 'catalog':
      return {
        area: 'catalog',
        rows: parse('rows', z.array(syncRowSchema), run.rows),
        options: parse('options', syncOptionsSchema, run.options),
        parseErrors: parse('parseErrors', z.array(syncRowErrorSchema), errors),
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
