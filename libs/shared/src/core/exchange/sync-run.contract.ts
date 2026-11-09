/** A run, whatever area it carries: only the rows and who may read them
 * differ between areas. */
import * as z from 'zod';

import {
  SYNC_AREAS,
  SYNC_FAILURE_MESSAGE_MAX_LENGTH,
  SYNC_LABEL_MAX_LENGTH,
} from './sync';

/** `previewed` is staged and applicable; `superseded` (a newer run replaced
 * it) and `discarded` (a person said no) never will be, and stay in the log. */
export const syncRunStatusSchema = z.enum([
  'previewed',
  'applied',
  'failed',
  /** Terminal at once: nothing to decide. Never a run that skipped rows,
   * however empty its diff. */
  'no-change',
  'superseded',
  'discarded',
]);
export type SyncRunStatus = z.infer<typeof syncRunStatusSchema>;

const syncRunSourceSchema = z.enum(['upload', 'api']);

export const syncAreaSchema = z.enum(SYNC_AREAS);

/** One shape for every area, so one log lists them side by side; the admin
 * text words each count per area. The defaulted counts are ones older stored
 * summaries lack. */
export const syncSummarySchema = z
  .object({
    rows: z.number().int().nonnegative(),
    create: z.number().int().nonnegative(),
    update: z.number().int().nonnegative(),
    softDelete: z.number().int().nonnegative(),
    restore: z.number().int().nonnegative(),
    unchanged: z.number().int().nonnegative(),
    categoriesCreated: z.number().int().nonnegative().default(0),
    categoriesRenamed: z.number().int().nonnegative().default(0),
    /** Left empty by the run, moved or swept. */
    categoriesEmptied: z.number().int().nonnegative().default(0),
    /** Live `manual:` products the delete sweep kept. */
    keptManual: z.number().int().nonnegative().default(0),
    /** Set-a-password links sent (FR-ADM-13): an effect, not a row, so a run
     * that only re-sent one is not `no-change`. */
    mailed: z.number().int().nonnegative().default(0),
    /** Keyless accounts adopted by address (FR-ADM-17): apart from `update`,
     * as it decides which account a key means. */
    claimed: z.number().int().nonnegative().default(0),
    /** Adopted by the platform's own id instead: its own count, as the
     * deployment sets a ceiling on each kind of evidence. */
    claimedById: z.number().int().nonnegative().default(0),
    errors: z.number().int().nonnegative(),
    /** The fields rewritten, as a change names them; creates are left out,
     * as they write everything. */
    fields: z.array(z.string()).default([]),
  })
  .strict();
export type SyncSummary = z.infer<typeof syncSummarySchema>;

/** Why a run waits for a person: outside the deployment's policy, or the
 * caller asked. The screen must say which. */
const syncStagedReasonSchema = z.enum(['policy', 'requested']);
export type SyncStagedReason = z.infer<typeof syncStagedReasonSchema>;

export const syncRunSchema = z
  .object({
    id: z.uuid(),
    status: syncRunStatusSchema,
    area: syncAreaSchema,
    source: syncRunSourceSchema,
    filename: z.string().nullable(),
    startedAt: z.iso.datetime(),
    finishedAt: z.iso.datetime().nullable(),
    /** Null for a machine run, or once that account is deleted. */
    actorEmail: z.string().nullable(),
    /** Null for an upload. Copied like `actorEmail`, so a revoked token is
     * still named. */
    tokenName: z.string().nullable(),
    /** Null on a run that applied itself. */
    stagedReason: syncStagedReasonSchema.nullable(),
    /** In the area's own shape, which parses it where it is acted on. Null
     * on a reported failure. */
    options: z.record(z.string(), z.unknown()).nullable(),
    summary: syncSummarySchema.nullable(),
    error: z.string().nullable(),
    /** The sender's note on a run that worked, kept verbatim like `error`. */
    notice: z.string().nullable(),
  })
  .strict();
export type SyncRun = z.infer<typeof syncRunSchema>;

/** A run as its source reads it back (FR-ADM-09): without `actorEmail`, the
 * one personal datum, which would leave on every poll. */
export const machineSyncRunSchema = syncRunSchema.omit({ actorEmail: true });
export type MachineSyncRun = z.infer<typeof machineSyncRunSchema>;

/** Also the answer for another area's run, so its existence does not leak. */
export const machineRunErrors = {
  'run-not-found': { status: 404 },
} as const;

/** A breakage the caller wants recorded (NFR-OPS-07), in its own words: no
 * code, as the platform refused nothing. */
export const syncFailureReportSchema = z
  .object({
    message: z.string().trim().min(1).max(SYNC_FAILURE_MESSAGE_MAX_LENGTH),
    label: z.string().trim().min(1).max(SYNC_LABEL_MAX_LENGTH).optional(),
  })
  .strict();
export type SyncFailureReport = z.infer<typeof syncFailureReportSchema>;

/** `applied` may differ from the preview if the data moved in between. */
export const syncCommitResponseSchema = z
  .object({ run: syncRunSchema, applied: syncSummarySchema })
  .strict();
export type SyncCommitResponse = z.infer<typeof syncCommitResponseSchema>;
