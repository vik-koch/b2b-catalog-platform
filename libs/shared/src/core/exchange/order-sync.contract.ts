/** An order run's record (FR-ADM-08): what each write-back instruction did,
 * for the run log and the sender. The instruction itself is the machine's. */
import * as z from 'zod';

import {
  orderStatusSchema,
  paymentStateSchema,
} from '../ordering/orders.contract';
import { syncSummarySchema } from './sync-run.contract';

/** `kind` in the thread's words; `payment` writes no version, as money is a
 * fact about the order. `unchanged` is reported, not refused: re-sending is
 * what a polling source does (FR-ADM-16). */
const orderWriteResultSchema = z
  .object({
    reference: z.string(),
    kind: z.enum(['adjustment', 'transition', 'payment', 'unchanged']),
    status: orderStatusSchema,
    paymentState: paymentStateSchema,
    /** What the next instruction must answer as `basedOnRevision`. */
    revisionNumber: z.number().int().positive(),
    notified: z.boolean(),
    /** A note lives on a version, so it was dropped where none was written.
     * Reported, not refused: a re-sent snapshot carries notes already said. */
    noteIgnored: z.boolean(),
  })
  .strict();
export type OrderWriteResult = z.infer<typeof orderWriteResultSchema>;

/** Why an instruction was skipped; it never fails the batch, or a retry
 * would re-answer the rest. */
export const ORDER_SYNC_ROW_ERROR_CODES = [
  /** `{reference}` */
  'order-not-found',
  /** Twice in one batch: nothing says which is later. */
  'duplicate-reference',
  /** `{basedOnRevision}` and `{current}`: moved since the source read it. */
  'order-changed',
  /** The customer called it off (FR-ORD-02), which they may do however the
   * area is owned; only `restoreCustomerCancellation` overrides it. */
  'order-called-off',
  /** A restore without `notify` and `showCustomer`. */
  'restore-not-announced',
  /** Scrubbed (NFR-LEGAL-14): only money may still be recorded. */
  'personal-data-removed',
  /** `{status}`: not reachable from where it is (FR-ORD-01). */
  'transition-not-allowed',
  /** The status owes a reason and none was given. */
  'reason-required',
  /** `{productSourceId}` */
  'unknown-product',
  /** `{productSourceId}`: twice in one instruction. */
  'duplicate-product',
  /** Nothing is owed on a refused order; a completed one may still be
   * settled. */
  'payment-not-recordable',
] as const;
export type OrderSyncRowErrorCode = (typeof ORDER_SYNC_ROW_ERROR_CODES)[number];

const orderSyncRowErrorSchema = z
  .object({
    /** 1-based position in the submitted instructions. */
    row: z.number().int().positive(),
    reference: z.string().nullable(),
    code: z.enum(ORDER_SYNC_ROW_ERROR_CODES),
    params: z.record(z.string(), z.string()).optional(),
  })
  .strict();
export type OrderSyncRowError = z.infer<typeof orderSyncRowErrorSchema>;

/** The shared summary: `update` counts orders written; creates and deletes
 * stay at zero. */
export const orderSyncPlanSchema = z
  .object({
    summary: syncSummarySchema,
    orders: z.array(orderWriteResultSchema),
    rowErrors: z.array(orderSyncRowErrorSchema),
    /** True when the list above was capped at SYNC_PREVIEW_MAX_ITEMS. */
    truncated: z.boolean(),
  })
  .strict();
export type OrderSyncPlan = z.infer<typeof orderSyncPlanSchema>;

/** See `isCustomerSyncPlan`. */
export function isOrderSyncPlan(plan: unknown): plan is OrderSyncPlan {
  return typeof plan === 'object' && plan !== null && 'orders' in plan;
}
