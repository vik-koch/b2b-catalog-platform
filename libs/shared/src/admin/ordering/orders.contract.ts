import * as z from 'zod';
import { ORDER_QUERY_MAX_LENGTH } from '../../core/ordering/order-constants';
import {
  authed,
  detailsRemoved,
  orderDetailErrors,
  orderNotFound,
  orderStatusSchema,
  orderSummarySchema,
  paymentMethodSchema,
  transitionErrors,
} from '../../core/ordering/orders.contract';
import {
  adminOrderDetailSchema,
  orderAdjustmentPreviewSchema,
  orderAdjustmentSchema,
  orderRevisionEntrySchema,
  orderRevisionSchema,
  orderTransitionSchema,
  staffOrderSortSchema,
  staffPaymentFilterSchema,
} from '../../core/ordering/staff-orders.contract';
import { ownershipErrors } from '../../sync/ownership-constants';
import { paginationSchema } from '../../platform/pagination.contract';

/**
 * What every staff write to an order carries, and no read and no customer
 * route does: while an external system owns order processing the platform's
 * own side of them is closed as a whole (FR-ADM-10), and the screens that show
 * them stay open.
 *
 * Placing an order and calling off an unanswered one are the customer's own
 * acts and are never refused by it — which is why this sits beside the
 * transition errors rather than inside them: one of the two callers of that
 * table is the customer.
 */
const owned = {
  'orders-externally-owned': ownershipErrors['orders-externally-owned'],
} as const;
/** Everything an adjustment can be refused for (FR-ORD-03). */
const adjustmentErrors = {
  ...orderNotFound,
  ...orderDetailErrors,
  ...detailsRemoved,
  /** Somebody else adjusted it while this one was being written. */
  'order-changed': { status: 409 },
  /** A slug no product answers to. Staff may add anything the catalog holds,
   * published or not — this is a request built against a different catalog. */
  'unknown-product': { status: 400 },
  /** A price list this deployment does not have. */
  'unknown-tier': { status: 400 },
  /** A line with no price of its own, on a product no list prices. Staff may
   * put such a product on an order, but they have to name the price. */
  'product-has-no-price': { status: 400 },
  /** An adjustment that changes nothing the order says. A version identical to
   * the one before it is not history, it is noise in it — and a note is an
   * account of a change rather than a change of its own. Refused here rather
   * than in the screen, so a system writing adjustments back cannot fill the
   * thread with re-sends of a state the order already holds. */
  'no-change': { status: 409 },
} as const;
/**
 * What a manager observed about the money (FR-ORD-04): it arrived, or the
 * earlier observation was wrong. A boolean rather than two routes because
 * there is one fact here and both moves set it.
 */
export const orderPaymentSchema = z
  .object({
    paid: z.boolean(),
  })
  .strict();
export type OrderPaymentInput = z.infer<typeof orderPaymentSchema>;

export const adminOrdersContract = {
  listOrders: authed
    .route({
      method: 'GET',
      path: '/admin/orders',
      inputStructure: 'detailed',
      summary: 'All order requests, for staff (FR-AUTH-03)',
    })
    .input(
      z.object({
        query: z.object({
          page: z.coerce.number().int().positive().optional(),
          status: orderStatusSchema.optional(),
          /**
           * Find-an-order, matched against the reference, who to ask for, the
           * party being invoiced and either email on the order — the handful
           * of things a manager has in front of them when the phone rings. A
           * fragment, not a whole value: a customer reads out the last digits
           * of a reference as readily as all of it.
           */
          q: z.string().trim().max(ORDER_QUERY_MAX_LENGTH).optional(),
          payment: staffPaymentFilterSchema.optional(),
          sort: staffOrderSortSchema.optional(),
        }),
      }),
    )
    .output(
      z
        .object({
          items: z.array(
            orderSummarySchema.extend({
              customerEmail: z.string().nullable(),
              contactName: z.string(),
              /** Staff only: the money column reads the method as well as the
               * state, because a cash order waiting to be handed over is not a
               * state — it is `not-due` like an unanswered one. */
              paymentMethod: paymentMethodSchema,
              /** Which version the order stands on, so a row can link straight
               * at the version it is describing rather than at "whatever is
               * current by the time the page opens". */
              revisionNumber: z.number().int().positive(),
            }),
          ),
          pagination: paginationSchema,
        })
        .strict(),
    ),

  getOrder: authed
    .route({
      method: 'GET',
      path: '/admin/orders/{reference}',
      inputStructure: 'detailed',
      summary: 'One order request, for staff',
    })
    .errors(orderNotFound)
    .input(z.object({ params: z.object({ reference: z.string() }) }))
    .output(adminOrderDetailSchema),

  /**
   * Move an order (FR-ORD-01/02). One endpoint rather than a verb apiece,
   * because the rule that says which moves exist is one table and this is the
   * caller that asks it.
   *
   * It answers with the order, so a screen that acted on it redraws from what
   * the server now holds rather than from what it hoped would happen.
   */
  transitionOrder: authed
    .route({
      method: 'POST',
      path: '/admin/orders/{reference}/status',
      inputStructure: 'detailed',
      summary: 'Accept, refuse, or move on an order (admin, manager)',
    })
    .errors({ ...transitionErrors, ...owned })
    .input(
      z.object({
        params: z.object({ reference: z.string() }),
        body: orderTransitionSchema,
      }),
    )
    .output(adminOrderDetailSchema),

  /**
   * Every version of one order, newest first (FR-ORD-03).
   *
   * Staff only, and deliberately so: a customer reads the order as it now
   * stands, with a note saying what changed. Handing them the version it
   * superseded would be handing them two orders and asking which is real —
   * the one they were sent by mail is the record of that.
   */
  listOrderRevisions: authed
    .route({
      method: 'GET',
      path: '/admin/orders/{reference}/revisions',
      inputStructure: 'detailed',
      summary: 'Every version of an order, for staff',
    })
    .errors(orderNotFound)
    .input(z.object({ params: z.object({ reference: z.string() }) }))
    .output(
      z.object({ revisions: z.array(orderRevisionEntrySchema) }).strict(),
    ),

  /**
   * One version of an order, read on its own (FR-ORD-03).
   *
   * The reading screen's route. A manager checking what the shop agreed on
   * Tuesday wants that version and not the thread, and fetching every snapshot
   * of a long-lived order to render one of them is a page that gets slower the
   * more the order was worked on.
   */
  getOrderRevision: authed
    .route({
      method: 'GET',
      path: '/admin/orders/{reference}/revisions/{number}',
      inputStructure: 'detailed',
      summary: 'One version of an order, for staff',
    })
    .errors(orderNotFound)
    .input(
      z.object({
        params: z.object({
          reference: z.string(),
          number: z.coerce.number().int().positive(),
        }),
      }),
    )
    .output(orderRevisionSchema),

  /**
   * What an adjustment would come to, without writing it (FR-ORD-03).
   *
   * The same pricing the write runs, answered as a draft: the screen shows a
   * manager the order they are proposing — corrected quantities, resolved
   * prices, the re-resolved zone and the new total — before anything is
   * recorded. A POST because it carries a whole order in its body, and a read
   * because it changes nothing.
   */
  previewOrderAdjustment: authed
    .route({
      method: 'POST',
      path: '/admin/orders/{reference}/adjustment/preview',
      inputStructure: 'detailed',
      summary: 'Price a proposed adjustment without writing it',
    })
    .errors({ ...adjustmentErrors, ...owned })
    .input(
      z.object({
        params: z.object({ reference: z.string() }),
        body: orderAdjustmentSchema,
      }),
    )
    .output(orderAdjustmentPreviewSchema),

  /**
   * Change what an order says (FR-ORD-03/04) — a new version of it, not an
   * edit of the old one (ADR 0051). The reference, the link and every
   * superseded version stay exactly where they were, and so does the status:
   * changing an order is not answering it.
   *
   * It sends nothing on its own. Whether the customer hears about a change is
   * a separate decision, made by the transition that follows it or by
   * `notifyOrderCustomer` — see `orderAdjustmentSchema.notify`.
   */
  adjustOrder: authed
    .route({
      method: 'POST',
      path: '/admin/orders/{reference}/adjustment',
      inputStructure: 'detailed',
      summary: 'Write a new version of the order (admin, manager)',
    })
    .errors({ ...adjustmentErrors, ...owned })
    .input(
      z.object({
        params: z.object({ reference: z.string() }),
        body: orderAdjustmentSchema,
      }),
    )
    .output(adminOrderDetailSchema),

  /**
   * Show the customer where the order has got to, and tell them (FR-NOTIF-03).
   *
   * The manual half of a rule that is otherwise automatic: while an order is
   * running, every move moves the customer's view with it. Once it has ended,
   * nothing does — a finished order that is reopened, corrected and finished
   * again would otherwise mail the customer a lap of a workflow that was only
   * ever staff putting their own record right. This is the button that says
   * this particular change was worth writing about.
   */
  notifyOrderCustomer: authed
    .route({
      method: 'POST',
      path: '/admin/orders/{reference}/notify',
      inputStructure: 'detailed',
      summary: "Bring the customer's view up to date, and mail them if asked",
    })
    .errors({
      ...orderNotFound,
      ...owned,
      ...detailsRemoved,
      /** There was nothing left to do: they are on the current version and
       * nobody asked for a message. */
      'nothing-to-tell': { status: 409 },
    })
    .input(
      z.object({
        params: z.object({ reference: z.string() }),
        body: z.object({
          /**
           * Whether to write to them as well as move their page on.
           *
           * Two questions, because they come apart: a version can reach their
           * page without a word (a step nobody needed to announce), and a
           * message can be owed for a version they already hold (one somebody
           * decided against, or one that went to a spam folder).
           */
          notify: z.boolean().default(true),
        }),
      }),
    )
    .output(adminOrderDetailSchema),

  /**
   * Record that the money arrived, or take that record back (FR-ORD-04). A
   * manager's observation, not a transaction: nothing here takes a payment,
   * and the order's status is untouched either way.
   *
   * One endpoint with the answer in the body, like the transition one: the
   * undo is the same observation corrected, not a refund. Clearing it puts the
   * order back to what its method and status say it owes, so an invoiced order
   * the shop is still waiting on reads `awaiting` again.
   */
  setOrderPayment: authed
    .route({
      method: 'POST',
      path: '/admin/orders/{reference}/payment',
      inputStructure: 'detailed',
      summary: "Record or clear an order's payment (admin, manager)",
    })
    .errors({
      ...orderNotFound,
      ...owned,
      /** Nothing to change: already recorded, already clear, or an order that
       * ended without being filled. */
      'payment-not-recordable': { status: 409 },
    })
    .input(
      z.object({
        params: z.object({ reference: z.string() }),
        body: orderPaymentSchema,
      }),
    )
    .output(adminOrderDetailSchema),

  /**
   * Removing the personal details from a guest order on the guest's request
   * (NFR-LEGAL-14): the scrub an account deletion runs, for an order with no
   * account to delete. An admin's alone, since it cannot be undone. Not
   * refused while an external system owns orders: the person's right
   * outranks the switch, as it does for an account.
   */
  removeOrderPersonalData: authed
    .route({
      method: 'DELETE',
      path: '/admin/orders/{reference}/personal-data',
      inputStructure: 'detailed',
      summary: "Remove a guest order's personal details on request (admin)",
    })
    .errors({
      ...orderNotFound,
      /** An account holder's orders go with their account (FR-ADM-23). */
      'order-not-guest': { status: 409 },
      /** Still running: the shop needs the details to fulfil it. */
      'order-not-finished': { status: 409 },
      'personal-data-removed': { status: 409 },
    })
    .input(z.object({ params: z.object({ reference: z.string() }) }))
    .output(adminOrderDetailSchema),
};
