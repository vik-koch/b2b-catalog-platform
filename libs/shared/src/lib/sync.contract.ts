import { oc } from '@orpc/contract';
import * as z from 'zod';
import { DEFAULT_SYNC_AREA } from './sync-constants';
import { catalogSyncPlanSchema } from './catalog-sync.contract';
import { customerSyncPlanSchema } from './customer-sync.contract';
import {
  syncAreaSchema,
  syncRunSchema,
  syncRunStatusSchema,
  syncSummarySchema,
} from './sync-run.contract';
import { commonAuthErrors } from './api-error';
import { ownershipErrors } from './ownership-constants';
import { paginationSchema } from './catalog.contract';
/**
 * A sync run, whatever it carried: the routes that read one, apply one and
 * give up on one, and the refusals they answer with.
 *
 * **One surface over every area** (ADR 0060). A run id is unique across the
 * areas and a staged run's link is mailed to whoever has to answer it, so
 * there is one run page and one set of routes rather than a parallel set per
 * area — which is why `getRun` returns a *union* of the area plan shapes and
 * why `SYNC_COMMIT_CODES` is the union of what the areas refuse.
 *
 * The payloads themselves live one file out, in the area that states them:
 * `catalog-sync.contract.ts` and `customer-sync.contract.ts`. Nothing here
 * knows what a row is.
 */

/**
 * The bulk catalog sync.
 *
 * This file is the *import contract*: the row shape a run consumes and the
 * per-run intent that decides what a run may write. It is deliberately
 * independent of both the public read contract and the storage schema,
 * and it is the one shape promised to stay stable — a client-specific converter
 * turns the raw export into it, so a changing export costs an adapter,
 * never a contract change.
 *
 * CSV and JSON are two *encodings* of the same rows; both decode into
 * `CatalogSyncRow[]` and run through the same validator, differ and applier.
 */

// --- Runs ----------------------------------------------------------------

/**
 * Why a whole file was refused before any row was read. The upload is
 * multipart, so it is not part of the router below — but its refusal shape is
 * the same as every other one here, and the browser needs it typed.
 *
 * These are the one place a code is not the whole story: what an admin needs
 * to see is *which* column is duplicated in the file on their screen. So the
 * body carries `params` for the deployment's own sentence to substitute, and
 * the values are the admin's own data (their column names, their row count) —
 * never wording of ours.
 */
export const SYNC_FORMAT_CODES = [
  'no-file',
  'file-too-large',
  'file-empty',
  'no-header-row',
  /** A quote is opened and never closed, so the parser cannot tell where a
   * field ends. `{row}` — the line the parser gave up on. */
  'malformed-quotes',
  /** `{column}` */
  'duplicate-column',
  /** `{columns}` and `{expected}` */
  'unknown-columns',
  /** `{column}` */
  'missing-required-column',
  /** `{rows}` and `{limit}` */
  'too-many-rows',
  /** The options field the upload form sends alongside; a client bug. */
  'options-invalid',
  /**
   * Not a fault in the file: the catalog is externally owned (FR-ADM-10) and
   * the manual upload is closed. It travels here because the upload is
   * multipart with a single refusal channel, and the screen needs to say this
   * sentence rather than a generic one.
   */
  'catalog-externally-owned',
  /** The same, said of the customer import (FR-ADM-12). The two uploads share
   * one refusal vocabulary because they share one multipart channel; which of
   * them is closed is not a thing the screen should have to work out from a
   * code that does not say. */
  'customers-externally-owned',
] as const;
export type SyncFormatCode = (typeof SYNC_FORMAT_CODES)[number];

/**
 * A refused upload, as it arrives.
 *
 * The upload is multipart and so not a contract route, but its refusals travel
 * in the same envelope as every other one — code at the top, anything the
 * wording needs under `data`. Read here and flattened, so the screen keeps
 * working with a plain `{ code, message, params }`.
 *
 * Not strict: the envelope carries `defined` and `status` as well, and neither
 * is this schema's business.
 */
export const syncFormatErrorSchema = z
  .object({
    code: z.enum(SYNC_FORMAT_CODES),
    message: z.string(),
    data: z
      .object({
        /** Substituted into the deployment's wording; absent where none is
         * needed. */
        params: z.record(z.string(), z.string()).optional(),
      })
      .optional(),
  })
  .transform(({ code, message, data }) => ({
    code,
    message,
    params: data?.params,
  }));
export type SyncFormatErrorBody = z.infer<typeof syncFormatErrorSchema>;

/** What a commit returns: the finished run plus what was *actually* applied,
 * which may differ from the preview if the catalog moved in between. */
export const syncCommitResponseSchema = z
  .object({ run: syncRunSchema, applied: syncSummarySchema })
  .strict();
export type SyncCommitResponse = z.infer<typeof syncCommitResponseSchema>;

/**
 * Why a previewed run could not be applied. `run-already-applied` and
 * `run-failed` are separate codes rather than one carrying the status, because
 * they are separate sentences: one says the work is already done, the other
 * that it went wrong and the file has to go up again.
 */
export const SYNC_COMMIT_CODES = [
  'run-not-found',
  'run-already-applied',
  'run-failed',
  /** There was nothing in it to apply. */
  'run-no-change',
  /** A newer run from the same source replaced this one's diff. */
  'run-superseded',
  /** An admin already decided against it. */
  'run-discarded',
  /** Staged rows pruned; the diff cannot be recomputed, so re-upload. */
  'run-rows-pruned',
  /**
   * An uploaded run staged before the catalog was handed over, and applied
   * after. Applying is the write, so it is judged by the setting in force now,
   * not the one in force when the file went up. Machine runs are unaffected:
   * they can only exist while the catalog *is* owned.
   */
  'catalog-externally-owned',
  /** The same, said of an uploaded customer run (FR-ADM-12). One route applies
   * every area's runs, so the codes it can answer with are the union of what
   * the areas refuse. */
  'customers-externally-owned',
] as const;
export type SyncCommitCode = (typeof SYNC_COMMIT_CODES)[number];

/** A run nobody staged is a 404; one that cannot be applied is a conflict. */
const commitErrors = {
  'run-not-found': { status: 404 },
  'run-already-applied': { status: 409 },
  'run-failed': { status: 409 },
  'run-no-change': { status: 409 },
  'run-superseded': { status: 409 },
  'run-discarded': { status: 409 },
  'run-rows-pruned': { status: 409 },
  'catalog-externally-owned': ownershipErrors['catalog-externally-owned'],
  'customers-externally-owned': ownershipErrors['customers-externally-owned'],
} as const satisfies Record<SyncCommitCode, { status: number }>;

/** The refusals a run this screen acts on can answer with — the same set for
 * applying and for discarding, since both need a run that is still staged. */
const runActionErrors = commitErrors;

/**
 * The JSON half of the sync surface. The preview *upload* is not here: it is
 * multipart/form-data, which the JSON-oriented contracts do not model, so it
 * lives on a plain Nest handler that returns `CatalogSyncPreviewResponse` (the same
 * split the media upload uses).
 */
/** Every sync route is admin-only. */
const admin = oc.errors(commonAuthErrors);

export const syncContract = {
  commitRun: admin
    .route({
      method: 'POST',
      path: '/admin/sync/runs/{id}/commit',
      inputStructure: 'detailed',
      summary: 'Apply a previewed run in one transaction (admin)',
    })
    .errors(commitErrors)
    .input(z.object({ params: z.object({ id: z.uuid() }) }))
    .output(syncCommitResponseSchema),

  getRun: admin
    .route({
      method: 'GET',
      path: '/admin/sync/runs/{id}',
      inputStructure: 'detailed',
      summary:
        'Fetch one run and its plan (staff by area; plan is null once pruned)',
    })
    .errors({ 'run-not-found': commitErrors['run-not-found'] })
    .input(z.object({ params: z.object({ id: z.uuid() }) }))
    .output(
      z
        .object({
          run: syncRunSchema,
          /**
           * The diff, in the shape its area states one. A union rather than a
           * second route, because this is one screen (ADR 0060): a run id is
           * unique across the areas, so a link mailed to whoever was asked to
           * answer a staged run works whatever that run carries.
           *
           * The two shapes are disjoint, so nothing has to be stored beside a
           * plan to tell them apart — `isCustomerSyncPlan` asks the value.
           */
          plan: z
            .union([catalogSyncPlanSchema, customerSyncPlanSchema])
            .nullable(),
        })
        .strict(),
    ),

  /**
   * Give up on a staged run. The row stays, marked as the decision it was:
   * without this the only way a preview leaves the queue is the next run
   * replacing it, and a work-awaiting count nobody can clear is a count
   * nobody reads.
   */
  discardRun: admin
    .route({
      method: 'POST',
      path: '/admin/sync/runs/{id}/discard',
      inputStructure: 'detailed',
      summary: 'Give up on a staged run (admin)',
    })
    .errors(runActionErrors)
    .input(z.object({ params: z.object({ id: z.uuid() }) }))
    .output(z.object({ run: syncRunSchema }).strict()),

  listRuns: admin
    .route({
      method: 'GET',
      path: '/admin/sync/runs',
      inputStructure: 'detailed',
      summary: "List one area's sync runs, newest first (staff by area)",
    })
    .input(
      z.object({
        query: z.object({
          page: z.coerce.number().int().min(1).default(1),
          /** Narrows the list to one outcome — what the panel's staged-run
           * count links into. Absent is every run. */
          status: syncRunStatusSchema.optional(),
          /** Which area's log to read. Defaulted rather than required: every
           * caller written before areas existed was asking about the catalog,
           * and that is still what it means. The screens always send it. */
          area: syncAreaSchema.default(DEFAULT_SYNC_AREA),
        }),
      }),
    )
    .output(
      z
        .object({
          runs: z.array(syncRunSchema),
          pagination: paginationSchema,
          /** The newest *applied* run of this area — the admin dashboard's
           * "last sync". Answered whatever the list is narrowed to by status:
           * it is a fact about the area, not about the page being read. */
          lastApplied: syncRunSchema.nullable(),
        })
        .strict(),
    ),
};
