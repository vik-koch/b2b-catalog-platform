import { oc } from '@orpc/contract';
import * as z from 'zod';
import { machineAuthErrors } from './api-tokens.contract';
import { CART_LINES_MAX } from './cart-constants';
import {
  ORDER_ADJUSTMENT_NOTE_MAX,
  ORDER_STATUS_REASON_MAX,
  ORDER_WRITE_ACTOR_MAX,
} from './order-constants';
import { orderStatusSchema, paymentStateSchema } from './orders.contract';
import { ownershipErrors } from './ownership-constants';
import { LINE_PIECES_MAX } from './product-units';
import {
  SYNC_FAILURE_MESSAGE_MAX_LENGTH,
  SYNC_LABEL_MAX_LENGTH,
  SYNC_MAX_ROWS,
} from './sync-constants';
import {
  machineRunErrors,
  machineSyncRunSchema,
  syncFailureReportSchema,
  syncRunSchema,
  syncSummarySchema,
} from './sync-run.contract';

/**
 * The write-back (FR-ADM-08, second half): what an owning system says has
 * become of an order it was handed.
 *
 * The other half of the outbound read (`order-read.contract.ts`). An order is
 * placed here whoever owns the area (FR-ADM-10), read out by the system that
 * works it, and answered here — so the customer keeps one page and one thread
 * of mail whichever side of the arrangement did the work.
 *
 * **One exchange writes at most one version** (FR-ORD-03, ADR 0051, ADR 0062).
 * Where the admin panel has three buttons — move it, change it, record the
 * money — this has one instruction carrying all three, because an order that
 * was approved, re-priced and paid between two polls is *one* thing that
 * happened to it and not three. Three calls would triple the thread and ask
 * the customer's mail question three times.
 *
 * **Gated on ownership**, unlike the read beside it: while nobody has handed
 * order processing over, the shop is answering its own orders and a second
 * writer is refused.
 *
 * **Never staged.** A catalog or customer run can wait for a person to read it,
 * because a person is the fallback owner of that data. Here the premise of the
 * arrangement is that the platform is *not* the reviewer — and per-order
 * requests arriving every poll cycle would fill the log with a row apiece.
 * A batch is one run, applied as it arrives.
 */

// --- One order's instruction ---------------------------------------------

/**
 * A line as the owning system says the order now reads.
 *
 * By `productSourceId`, the key the catalog exchange delivered the product
 * under (FR-ADM-02) and the one the outbound read quotes — the storefront slug
 * is a URL the shop may rename, and the platform publishes no article number.
 *
 * Counted in **pieces**, which is how the source system prices a line. The unit
 * the customer read it through is carried forward from the line it replaces,
 * and so is the customer's own note about it: both are the customer's reading
 * of their own order, and a write-back that could rewrite either would be
 * answering on their behalf.
 */
export const orderSyncLineSchema = z
  .object({
    productSourceId: z.string().trim().min(1).max(255),
    pieces: z.number().int().positive().max(LINE_PIECES_MAX),
    /** The price of one piece, or null to take today's price from the list
     * this order is charged against. */
    priceMinor: z.number().int().nonnegative().nullable().default(null),
  })
  .strict();
export type OrderSyncLine = z.infer<typeof orderSyncLineSchema>;

/**
 * What has become of one order.
 *
 * Every field but the two flags and the version is optional, and absent means
 * *unchanged*: an exchange that only moves an order sends no lines, and one
 * that only re-prices it sends no status. What is **not** optional is
 * `basedOnRevision` — the version the source last read (the outbound read
 * hands it out) — so two writers cannot silently overwrite one another, and an
 * instruction written against an order that has since moved is refused with
 * what it is rather than applied to something else.
 *
 * `notify` and `showCustomer` are required on the wire and have no default.
 * They are the two questions a manager answers on every move (FR-NOTIF-03),
 * and a polling exchange has to answer them too: whether this is worth a
 * message, and whether the customer's own page follows it. A default would
 * quietly decide for the shop how loud its own mail is.
 */
export const orderWriteSchema = z
  .object({
    reference: z.string().trim().min(1).max(32),
    /** The version this instruction answers, as the read reported it. */
    basedOnRevision: z.number().int().positive(),
    /** Where the order now stands, in the platform's own coarse vocabulary
     * (FR-ORD-01). The source system's own steps are mapped onto it over
     * there — however many an order passes through, the customer reads the
     * ones that concern them. Absent leaves it where it is. */
    status: orderStatusSchema.optional(),
    /** Why, where the status is one of the two that owe an answer
     * (FR-ORD-02). The customer is shown it. */
    statusReason: z
      .string()
      .trim()
      .min(1)
      .max(ORDER_STATUS_REASON_MAX)
      .nullable()
      .optional(),
    /** What the shop says about this version, in the owning system's words.
     * The customer's mail quotes it. */
    note: z
      .string()
      .trim()
      .min(1)
      .max(ORDER_ADJUSTMENT_NOTE_MAX)
      .nullable()
      .optional(),
    /**
     * What the order now contains, whole — not a patch. A version assembled
     * from "the old lines plus these two" is a version nobody can point at.
     * Absent leaves the lines exactly as they are.
     */
    lines: z.array(orderSyncLineSchema).min(1).max(CART_LINES_MAX).optional(),
    /**
     * Whether the money has arrived (FR-ORD-04). A second axis, never a step
     * in the status: cash is handed over after the goods are. Absent leaves
     * the record alone; `false` takes back a payment recorded in error, which
     * is the same correction a manager can make.
     */
    paid: z.boolean().optional(),
    /** Whether the customer is written to about this version. */
    notify: z.boolean(),
    /** Whether the customer's own page moves on to it. */
    showCustomer: z.boolean(),
  })
  .strict();
export type OrderWrite = z.infer<typeof orderWriteSchema>;

// --- What one instruction did --------------------------------------------

/**
 * What a write-back did to one order.
 *
 * `kind` is why the version exists, in the same words the thread uses:
 * `adjustment` where the order's content moved, `transition` where only its
 * status did, and `payment` where neither did and the money was recorded —
 * which writes no version at all, because what has been received is a fact
 * about the order rather than a reading of it.
 *
 * `unchanged` is the one every polling source produces most: the instruction
 * said what the order already said, so nothing was written and nobody was
 * mailed (FR-ADM-16). It is reported rather than refused — a re-send is the
 * normal behaviour of a source that cannot remember what it sent.
 */
export const orderWriteResultSchema = z
  .object({
    reference: z.string(),
    kind: z.enum(['adjustment', 'transition', 'payment', 'unchanged']),
    /** Where the order stands now, whether or not this instruction moved it. */
    status: orderStatusSchema,
    paymentState: paymentStateSchema,
    /** The version the order now stands on — what the next instruction about
     * it must answer. */
    revisionNumber: z.number().int().positive(),
    /** Whether a message went to the customer about it. */
    notified: z.boolean(),
  })
  .strict();
export type OrderWriteResult = z.infer<typeof orderWriteResultSchema>;

/**
 * Why one instruction was skipped. Codes, not sentences, as everywhere else;
 * `params` carries the values from the sending system's own data that the
 * deployment's wording quotes back.
 *
 * One instruction failing never fails the batch. A run that refused three
 * orders and wrote forty is a run that wrote forty, and an exchange that had
 * to re-send the lot to retry three would re-answer the forty as well.
 */
export const ORDER_SYNC_ROW_ERROR_CODES = [
  /** `{reference}` — no order is quoted that. */
  'order-not-found',
  /** The same order twice in one batch: two answers to one question, and
   * nothing here can say which of them is the later one. */
  'duplicate-reference',
  /**
   * `{basedOnRevision}` and `{current}` — the order has moved since the source
   * read it. Its own refusal rather than a silent overwrite: something else
   * wrote a version, and an instruction written against the one before it was
   * decided against facts that have changed.
   */
  'order-changed',
  /**
   * The customer called this order off (FR-ORD-02), which they may do however
   * the area is owned (FR-ADM-10). Refused rather than driven forward over the
   * top — the alternative is a cancellation that silently never happened.
   */
  'order-called-off',
  /** `{status}` — the order cannot go there from where it is (FR-ORD-01). */
  'transition-not-allowed',
  /** The status asked for owes the customer an answer and none was given. */
  'reason-required',
  /** `{productSourceId}` — no product here carries that key. */
  'unknown-product',
  /** `{productSourceId}` — one instruction names a product twice. */
  'duplicate-product',
  /** Nothing is owed on an order that ended, so nothing can be recorded
   * against it. */
  'payment-not-recordable',
] as const;
export type OrderSyncRowErrorCode = (typeof ORDER_SYNC_ROW_ERROR_CODES)[number];

export const orderSyncRowErrorSchema = z
  .object({
    /** 1-based position in the submitted instructions. */
    row: z.number().int().positive(),
    reference: z.string().nullable(),
    code: z.enum(ORDER_SYNC_ROW_ERROR_CODES),
    params: z.record(z.string(), z.string()).optional(),
  })
  .strict();
export type OrderSyncRowError = z.infer<typeof orderSyncRowErrorSchema>;

/**
 * What a batch did.
 *
 * The **summary is the shared one**, as every area's is: `update` counts the
 * orders this run wrote, `unchanged` the ones that already said what it said,
 * and `errors` the ones it could not answer. The fields only other areas fill
 * stay at zero — there is nothing here to create and nothing to soft-delete,
 * because an order arrives from the storefront and never leaves.
 */
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

/**
 * Which kind of plan a run's page is holding. The areas' plans are disjoint
 * shapes, so the question is decidable from the value — see
 * `isCustomerSyncPlan` for why that matters to a template.
 */
export function isOrderSyncPlan(plan: unknown): plan is OrderSyncPlan {
  return typeof plan === 'object' && plan !== null && 'orders' in plan;
}

// --- The batch -----------------------------------------------------------

/**
 * What an automated client submits: the same envelope the other areas use —
 * a label and a notice — around order instructions.
 *
 * Two things it deliberately lacks. There are **no options**: every other area
 * has a run-wide intent to declare (which fields to write, whether to create,
 * whether to sweep), and here each instruction says what it does. And there is
 * **no `requestReview`**: nothing here can be staged, so asking to be doubted
 * would be asking for something the area cannot do.
 */
export const orderSyncSubmissionSchema = z
  .object({
    orders: z.array(orderWriteSchema).min(1).max(SYNC_MAX_ROWS),
    /** What to call this run in the log, where an upload has a filename. */
    label: z.string().trim().min(1).max(SYNC_LABEL_MAX_LENGTH).optional(),
    /**
     * Whoever acted in the owning system, in that system's own words.
     *
     * An **opaque label**, kept verbatim beside the versions this run writes
     * and never resolved to an account here (FR-ADM-08): the person named is a
     * user of the other system, the shop has no way to know whether a matching
     * name here is the same human being, and guessing would put one person's
     * name on another's work. Absent, the credential's own name stands in —
     * the token is the author of record either way.
     */
    actor: z.string().trim().min(1).max(ORDER_WRITE_ACTOR_MAX).optional(),
    /** Something the sending system wants a person to read beside the run. */
    notice: z
      .string()
      .trim()
      .min(1)
      .max(SYNC_FAILURE_MESSAGE_MAX_LENGTH)
      .optional(),
  })
  .strict();
export type OrderSyncSubmission = z.infer<typeof orderSyncSubmissionSchema>;

export const orderSyncSubmitResponseSchema = z
  .object({ run: syncRunSchema, plan: orderSyncPlanSchema })
  .strict();
export type OrderSyncSubmitResponse = z.infer<
  typeof orderSyncSubmitResponseSchema
>;

// --- The routes ----------------------------------------------------------

/**
 * Its own capability (`order-sync`), separate from `order-read` beside it, for
 * the reason the customer area's two are separate: a system reads orders for
 * weeks before anybody lets it answer one, and the guard names one capability
 * per class.
 */
const machine = oc.errors({
  ...machineAuthErrors,
  // Nobody has handed order processing over, so the shop is answering its own
  // orders and a second writer is refused. The mirror of the refusal the admin
  // panel meets while the area *is* owned.
  'orders-not-externally-owned': ownershipErrors['orders-not-externally-owned'],
});

/** Reading a run back is ungated, as in every area: a source whose writes are
 * being refused is precisely the one that needs to be able to look. */
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

  /** What became of one order run (FR-ADM-09) — the same answer the other two
   * areas give, scoped to this one by the capability on the token. */
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
