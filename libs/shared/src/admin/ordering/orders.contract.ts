import { oc } from '@orpc/contract';
import * as z from 'zod';
import { ORDER_QUERY_MAX_LENGTH } from '../../core/ordering/orders';
import {
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
import { commonAuthErrors } from '../../lib/core/api-error';

/**
 * Every staff write, while an external system owns order processing
 * (FR-ADM-10). Not in `transitionErrors`: the customer's cancel uses those and
 * is never refused by it.
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
  /** Staff may add any product, published or not; this one does not exist. */
  'unknown-product': { status: 400 },
  /** A price list this deployment does not have. */
  'unknown-tier': { status: 400 },
  /** No price on the line and none on any list: staff must name one. */
  'product-has-no-price': { status: 400 },
  /** Nothing the order says changed; a note alone is not a change. Refused
   * here so an exchange cannot fill the thread with re-sends. */
  'no-change': { status: 409 },
} as const;

/** A row of the staff list: the order, plus who it came from. */
export const staffOrderSummarySchema = orderSummarySchema.extend({
  customerEmail: z.string().nullable(),
  contactName: z.string(),
  /** A cash order awaiting its handover is `not-due` like an unanswered one;
   * the method tells them apart. */
  paymentMethod: paymentMethodSchema,
  /** So a row links to the version it describes. */
  revisionNumber: z.number().int().positive(),
});
export type StaffOrderSummary = z.infer<typeof staffOrderSummarySchema>;

const admin = oc.errors(commonAuthErrors);

export const adminOrdersContract = {
  listOrders: admin
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
          /** A fragment of the reference, contact, party or either email:
           * what a manager has in front of them when the phone rings. */
          q: z.string().trim().max(ORDER_QUERY_MAX_LENGTH).optional(),
          payment: staffPaymentFilterSchema.optional(),
          sort: staffOrderSortSchema.optional(),
        }),
      }),
    )
    .output(
      z
        .object({
          items: z.array(staffOrderSummarySchema),
          pagination: paginationSchema,
        })
        .strict(),
    ),

  getOrder: admin
    .route({
      method: 'GET',
      path: '/admin/orders/{reference}',
      inputStructure: 'detailed',
      summary: 'One order request, for staff',
    })
    .errors(orderNotFound)
    .input(z.object({ params: z.object({ reference: z.string() }) }))
    .output(adminOrderDetailSchema),

  /** Move an order (FR-ORD-01/02): one route, as the moves are one table. */
  transitionOrder: admin
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

  /** Every version, newest first (FR-ORD-03). Staff only: a customer reads
   * the order as it stands, with a note on what changed. */
  listOrderRevisions: admin
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

  /** One version on its own, so reading Tuesday's does not fetch the thread. */
  getOrderRevision: admin
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

  /** What an adjustment would come to, priced by the write's arithmetic
   * without writing (FR-ORD-03). A POST for its body; it changes nothing. */
  previewOrderAdjustment: admin
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
   * A new version of the order, not an edit (ADR 0051); the status stands.
   * It mails nobody: the move that follows does, or `notifyOrderCustomer`.
   */
  adjustOrder: admin
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
   * Bring the customer's page up to the current version and, if asked, mail
   * them (FR-NOTIF-03): after an order ends, moves no longer do it on their
   * own.
   */
  notifyOrderCustomer: admin
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
      /** Already on the current version, and no mail asked for. */
      'nothing-to-tell': { status: 409 },
    })
    .input(
      z.object({
        params: z.object({ reference: z.string() }),
        body: z.object({
          /** Separate from moving their page: either can be owed alone. */
          notify: z.boolean().default(true),
        }),
      }),
    )
    .output(adminOrderDetailSchema),

  /**
   * Record the money as arrived, or take that back (FR-ORD-04): an
   * observation, not a transaction. Cleared, the order owes what its method
   * and status say.
   */
  setOrderPayment: admin
    .route({
      method: 'POST',
      path: '/admin/orders/{reference}/payment',
      inputStructure: 'detailed',
      summary: "Record or clear an order's payment (admin, manager)",
    })
    .errors({
      ...orderNotFound,
      ...owned,
      /** Already so, or an order that ended unfilled. */
      'payment-not-recordable': { status: 409 },
    })
    .input(
      z.object({
        params: z.object({ reference: z.string() }),
        body: z.object({ paid: z.boolean() }).strict(),
      }),
    )
    .output(adminOrderDetailSchema),

  /**
   * A guest's request to remove their details (NFR-LEGAL-14). An admin's
   * alone, as it cannot be undone; not refused while orders are owned
   * elsewhere, as the person's right outranks the switch.
   */
  removeOrderPersonalData: admin
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
      ...detailsRemoved,
    })
    .input(z.object({ params: z.object({ reference: z.string() }) }))
    .output(adminOrderDetailSchema),
};
