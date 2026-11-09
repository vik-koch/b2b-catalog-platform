/**
 * The staff's routes over a run of any area: read, apply, discard, list. One
 * set, not one per area: a run id is unique across areas, and a staged run's
 * mailed link must work whatever it carries.
 */
import { oc } from '@orpc/contract';
import * as z from 'zod';

import { catalogSyncPlanSchema } from '../../core/exchange/catalog-sync.contract';
import { customerSyncPlanSchema } from '../../core/exchange/customer-sync.contract';
import { orderSyncPlanSchema } from '../../core/exchange/order-sync.contract';
import { DEFAULT_SYNC_AREA } from '../../core/exchange/sync';
import {
  syncAreaSchema,
  syncCommitResponseSchema,
  syncRunSchema,
  syncRunStatusSchema,
} from '../../core/exchange/sync-run.contract';
import { commonAuthErrors } from '../../platform/api-error';
import { ownershipErrors } from '../../platform/ownership';
import { paginationSchema } from '../../platform/pagination.contract';

/** Why a whole uploaded file was refused. The upload is multipart, outside the
 * router, so its refusals are typed here; `params` quote the admin's own file. */
const SYNC_FORMAT_CODES = [
  'no-file',
  'file-too-large',
  'file-empty',
  'no-header-row',
  /** `{row}`: a quote opened and never closed. */
  'malformed-quotes',
  /** `{column}` */
  'duplicate-column',
  /** `{columns}` and `{expected}` */
  'unknown-columns',
  /** `{column}` */
  'missing-required-column',
  /** `{rows}` and `{limit}` */
  'too-many-rows',
  /** The form's options field: a client bug. */
  'options-invalid',
  /** Not the file's fault: the area is owned (FR-ADM-10), so the upload is
   * closed. Here, as the multipart upload has one refusal channel. */
  'catalog-externally-owned',
  'customers-externally-owned',
] as const;
export type SyncFormatCode = (typeof SYNC_FORMAT_CODES)[number];

/** A refused upload in the usual envelope, flattened to `{ code, message,
 * params }`. Not strict: the envelope also carries `defined` and `status`. */
export const syncFormatErrorSchema = z
  .object({
    code: z.enum(SYNC_FORMAT_CODES),
    message: z.string(),
    data: z
      .object({
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

/** Why a staged run cannot be applied or discarded: a code per sentence. One
 * route serves every area, so this is the union of their refusals. */
const runActionErrors = {
  'run-not-found': { status: 404 },
  'run-already-applied': { status: 409 },
  'run-failed': { status: 409 },
  'run-no-change': { status: 409 },
  'run-superseded': { status: 409 },
  'run-discarded': { status: 409 },
  /** The staged rows are pruned, so the file must go up again. */
  'run-rows-pruned': { status: 409 },
  /** An upload staged before the hand-over: applying is judged now. */
  'catalog-externally-owned': ownershipErrors['catalog-externally-owned'],
  'customers-externally-owned': ownershipErrors['customers-externally-owned'],
} as const;
export type SyncCommitCode = keyof typeof runActionErrors;

const admin = oc.errors(commonAuthErrors);

/** The uploads are multipart, so plain Nest handlers like the media upload. */

export const adminSyncContract = {
  commitRun: admin
    .route({
      method: 'POST',
      path: '/admin/sync/runs/{id}/commit',
      inputStructure: 'detailed',
      summary: 'Apply a previewed run in one transaction (admin)',
    })
    .errors(runActionErrors)
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
    .errors({ 'run-not-found': runActionErrors['run-not-found'] })
    .input(z.object({ params: z.object({ id: z.uuid() }) }))
    .output(
      z
        .object({
          run: syncRunSchema,
          /** The shapes are disjoint; `isCustomerSyncPlan` and
           * `isOrderSyncPlan` tell them apart. */
          plan: z
            .union([
              catalogSyncPlanSchema,
              customerSyncPlanSchema,
              orderSyncPlanSchema,
            ])
            .nullable(),
        })
        .strict(),
    ),

  /** The row stays, marked as the decision it was. */
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
          /** What the panel's staged-run count links into. */
          status: syncRunStatusSchema.optional(),
          area: syncAreaSchema.default(DEFAULT_SYNC_AREA),
        }),
      }),
    )
    .output(
      z
        .object({
          runs: z.array(syncRunSchema),
          pagination: paginationSchema,
          /** The dashboard's "last sync", whatever the status filter. */
          lastApplied: syncRunSchema.nullable(),
        })
        .strict(),
    ),
};
