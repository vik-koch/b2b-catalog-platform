import { oc } from '@orpc/contract';
import * as z from 'zod';

import { cartPreviewSchema } from '../../core/ordering/cart.contract';
import { ORDER_STATUS_REASON_MAX } from '../../core/ordering/orders';
import {
  myOrderFilterSchema,
  orderDetailErrors,
  orderDetailSchema,
  orderNotFound,
  orderSubmissionSchema,
  orderSummarySchema,
  transitionErrors,
} from '../../core/ordering/orders.contract';
import { commonAuthErrors } from '../../platform/api-error';
import { paginationSchema } from '../../platform/pagination.contract';

/** Every refusal the checkout can give. */
const submissionErrors = {
  ...orderDetailErrors,
  /** A guest's form has no account to resolve a party from. */
  'party-required': { status: 400 },
  /** Role is not a pricing group: staff have no tier and nobody to invoice. */
  'staff-cannot-order': { status: 400 },
  /** The honeypot. Its own code: a person tripped by autofill reads it. */
  rejected: { status: 400 },
  /** The deployment enforces pairings (FR-SET-04). Not `cart-changed`: the
   * cart is exactly the one the customer was shown. */
  'pairing-unsatisfied': {
    status: 400,
    data: z.object({
      shortfalls: z.array(
        z.object({
          slug: z.string(),
          shortPieces: z.number().int().positive(),
        }),
      ),
    }),
  },
  /** The fresh pricing rides along, so the page shows what changed. */
  'cart-changed': {
    status: 409,
    data: z.object({ preview: cartPreviewSchema }),
  },
} as const;

const account = oc.errors(commonAuthErrors);

/** Placing an order and reading it back (FR-CART-03, FR-ACC-01, FR-NOTIF-06). */
export const ordersContract = {
  submitOrder: oc
    .route({
      method: 'POST',
      path: '/orders',
      successStatus: 201,
      inputStructure: 'detailed',
      summary: 'Place an order request',
    })
    .errors(submissionErrors)
    .input(z.object({ body: orderSubmissionSchema }))
    .output(
      z
        .object({
          reference: z.string(),
          /** A guest's only record of the order (FR-NOTIF-06). */
          publicToken: z.string(),
        })
        .strict(),
    ),

  listMyOrders: account
    .route({
      method: 'GET',
      path: '/account/orders',
      inputStructure: 'detailed',
      summary: "The signed-in account's order requests (FR-ACC-01)",
    })
    .input(
      z.object({
        query: z.object({
          page: z.coerce.number().int().positive().optional(),
          /** One of the queues the account marker links to; absent is the
           * whole history. */
          state: myOrderFilterSchema.optional(),
        }),
      }),
    )
    .output(
      z
        .object({
          items: z.array(orderSummarySchema),
          pagination: paginationSchema,
        })
        .strict(),
    ),

  getMyOrder: account
    .route({
      method: 'GET',
      path: '/account/orders/{reference}',
      inputStructure: 'detailed',
      summary: 'One of the account’s own order requests',
    })
    .errors(orderNotFound)
    .input(z.object({ params: z.object({ reference: z.string() }) }))
    .output(orderDetailSchema),

  getOrderByToken: oc
    .route({
      method: 'GET',
      path: '/orders/by-token/{token}',
      inputStructure: 'detailed',
      summary: 'A mailed order summary, readable without signing in',
    })
    .errors(orderNotFound)
    .input(z.object({ params: z.object({ token: z.string() }) }))
    .output(orderDetailSchema),

  /**
   * The customer calling their own order off (FR-ORD-02): one move, on their
   * own orders. Not on the token view: a forwarded mail must not stop an
   * order. The reason is optional: a customer owes the shop no justification.
   */
  cancelMyOrder: account
    .route({
      method: 'POST',
      path: '/account/orders/{reference}/cancel',
      inputStructure: 'detailed',
      summary: 'Call off your own order while the shop has not started on it',
    })
    .errors(transitionErrors)
    .input(
      z.object({
        params: z.object({ reference: z.string() }),
        body: z
          .object({
            reason: z
              .string()
              .trim()
              .min(1)
              .max(ORDER_STATUS_REASON_MAX)
              .nullable(),
          })
          .strict(),
      }),
    )
    .output(orderDetailSchema),
};
