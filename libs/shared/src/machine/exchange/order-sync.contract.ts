import { oc } from '@orpc/contract';
import * as z from 'zod';
import { LINE_PIECES_MAX } from '../../core/catalog/product-units';
import { machineAuthErrors } from '../../core/exchange/machine-auth.contract';
import { orderSyncPlanSchema } from '../../core/exchange/order-sync.contract';
import {
  SYNC_FAILURE_MESSAGE_MAX_LENGTH,
  SYNC_LABEL_MAX_LENGTH,
  SYNC_PREVIEW_MAX_ITEMS,
} from '../../core/exchange/sync-constants';
import {
  machineRunErrors,
  machineSyncRunSchema,
  syncFailureReportSchema,
  syncRunSchema,
} from '../../core/exchange/sync-run.contract';
import { CART_LINES_MAX } from '../../core/ordering/cart';
import {
  ORDER_ADJUSTMENT_NOTE_MAX,
  ORDER_STATUS_REASON_MAX,
  ORDER_WRITE_ACTOR_MAX,
} from '../../core/ordering/orders';
import { orderStatusSchema } from '../../core/ordering/orders.contract';
import { ownershipErrors } from '../../platform/ownership-constants';

/**
 * The order write-back (FR-ADM-08): what the owning system says became of an
 * order it read out. One instruction carries move, change and payment, and
 * writes at most one version (FR-ORD-03). Gated on ownership, and never
 * staged: the platform is not the reviewer here.
 */
/** A line by the product's source key, in pieces. The customer's unit and
 * note carry over from the line it replaces: they are the customer's own. */
const orderSyncLineSchema = z
  .object({
    productSourceId: z.string().trim().min(1).max(255),
    pieces: z.number().int().positive().max(LINE_PIECES_MAX),
    /** One piece's price; null takes today's from the order's list. */
    priceMinor: z.number().int().nonnegative().nullable().default(null),
  })
  .strict();
export type OrderSyncLine = z.infer<typeof orderSyncLineSchema>;

/**
 * What became of one order; absent is unchanged. `basedOnRevision` is
 * required, so two writers cannot overwrite each other. `notify` and
 * `showCustomer` have no default: they are a manager's two questions on every
 * move (FR-NOTIF-03), and a default would decide how loud the shop's mail is.
 */
const orderWriteSchema = z
  .object({
    reference: z.string().trim().min(1).max(32),
    /** The version this instruction answers, as the read reported it. */
    basedOnRevision: z.number().int().positive(),
    /** Takes back the customer's own cancellation (FR-ORD-02); without it,
     * `order-called-off`. Requires `notify` and `showCustomer`. */
    restoreCustomerCancellation: z.boolean().optional(),
    /** The platform's coarse status (FR-ORD-01); the source maps its own
     * steps onto it. */
    status: orderStatusSchema.optional(),
    /** Shown to the customer where the status owes a reason (FR-ORD-02). */
    statusReason: z
      .string()
      .trim()
      .min(1)
      .max(ORDER_STATUS_REASON_MAX)
      .nullable()
      .optional(),
    /** The shop's word on this version, quoted in the customer's mail. */
    note: z
      .string()
      .trim()
      .min(1)
      .max(ORDER_ADJUSTMENT_NOTE_MAX)
      .nullable()
      .optional(),
    /** The whole order, not a patch. */
    lines: z.array(orderSyncLineSchema).min(1).max(CART_LINES_MAX).optional(),
    /** Payment (FR-ORD-04), apart from the status; `false` corrects a
     * payment recorded in error. */
    paid: z.boolean().optional(),
    notify: z.boolean(),
    showCustomer: z.boolean(),
  })
  .strict();
export type OrderWrite = z.infer<typeof orderWriteSchema>;

/** No options, as each instruction says what it does, and no
 * `requestReview`, as nothing here stages. */
const orderSyncSubmissionSchema = z
  .object({
    /** Capped at the answer's own cap: a longer batch would apply in full
     * and answer in part, and which orders were mailed is not read back. */
    orders: z.array(orderWriteSchema).min(1).max(SYNC_PREVIEW_MAX_ITEMS),
    label: z.string().trim().min(1).max(SYNC_LABEL_MAX_LENGTH).optional(),
    /** Who acted upstream, kept verbatim and never matched to an account
     * here (FR-ADM-08); absent, the token's name stands in. */
    actor: z.string().trim().min(1).max(ORDER_WRITE_ACTOR_MAX).optional(),
    notice: z
      .string()
      .trim()
      .min(1)
      .max(SYNC_FAILURE_MESSAGE_MAX_LENGTH)
      .optional(),
  })
  .strict();
export type OrderSyncSubmission = z.infer<typeof orderSyncSubmissionSchema>;

const orderSyncSubmitResponseSchema = z
  .object({ run: syncRunSchema, plan: orderSyncPlanSchema })
  .strict();
export type OrderSyncSubmitResponse = z.infer<
  typeof orderSyncSubmitResponseSchema
>;

/** Its own scope, apart from `order-read`: a system reads for weeks before
 * it may answer. Refused while the shop answers its own orders. */
const machine = oc.errors({
  ...machineAuthErrors,
  'orders-not-externally-owned': ownershipErrors['orders-not-externally-owned'],
});

/** Not gated on ownership, as in every area. */
const machineRead = oc.errors(machineAuthErrors);

export const machineOrderSyncContract = {
  submitRun: machine
    .route({
      method: 'POST',
      path: '/machine/sync/orders/runs',
      successStatus: 201,
      inputStructure: 'detailed',
      summary: 'Write orders back (machine)',
    })
    .input(z.object({ body: orderSyncSubmissionSchema }))
    .output(orderSyncSubmitResponseSchema),

  /** What became of an order run (FR-ADM-09). */
  getRun: machineRead
    .route({
      method: 'GET',
      path: '/machine/sync/orders/runs/{id}',
      inputStructure: 'detailed',
      summary: 'Read back one order run (machine)',
    })
    .errors(machineRunErrors)
    .input(z.object({ params: z.object({ id: z.uuid() }) }))
    .output(z.object({ run: machineSyncRunSchema }).strict()),

  reportFailure: machine
    .route({
      method: 'POST',
      path: '/machine/sync/orders/failures',
      successStatus: 201,
      inputStructure: 'detailed',
      summary: 'Record an order run that failed before it began (machine)',
    })
    .input(z.object({ body: syncFailureReportSchema }))
    .output(z.object({ run: syncRunSchema }).strict()),
};
