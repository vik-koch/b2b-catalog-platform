import { oc } from '@orpc/contract';
import * as z from 'zod';
import { machineAuthErrors } from './api-tokens.contract';
import { productUnitSchema } from './cart.contract';
import { ORDER_READ_MAX_LIMIT } from './order-constants';
import {
  fulfilmentMethodSchema,
  orderAddressSchema,
  orderContactSchema,
  orderingPartySchema,
  orderPickupSchema,
  orderStatusSchema,
  paymentMethodSchema,
  paymentStateSchema,
} from './orders.contract';

/**
 * The outbound read of orders (FR-ADM-08, first half; NFR-LEGAL-07): what a
 * connected system may learn about the orders the shop has taken.
 *
 * The half of the exchange that has to exist first. An order is placed here —
 * by a customer, on the storefront, whoever owns the area (FR-ADM-10) — and
 * until something can read it out, no outside system can work it, invoice it
 * or write anything back about it.
 *
 * **Its own capability** (`order-read`), not a route on the write-back's, for
 * the reason `customer-read` is its own (FR-ADM-18): reading what the shop has
 * sold and writing to live orders are different powers, an operator has real
 * reason to hand over one without the other — a system being prepared for a
 * go-live pulls orders for weeks before it is ever allowed to move one — and
 * the guard names one capability per class, so keeping them apart costs one
 * enum value.
 *
 * **Not gated on ownership**, unlike the write-back. A read carries no
 * instruction and cannot collide with the shop's own work, and the case it
 * exists for is precisely the one before the hand-over. What gates it is the
 * token an admin issued, which is the "configured rather than assumed"
 * NFR-LEGAL-07 asks for.
 */

// --- One order, as the outside reads it ----------------------------------

/**
 * The counterparty, by the handles the exchange addresses accounts with
 * (FR-ADM-14) rather than by the details the checkout happened to carry.
 *
 * Null on a guest order: there is no account, and the contact and party on the
 * order are all there has ever been of that customer.
 *
 * `sourceId` is null where the account was registered here and nobody has
 * claimed it yet (FR-ADM-17) — an order can perfectly well arrive for a
 * customer the other system has never heard of, which is what `accountId` is
 * for: the same handle FR-ADM-18's read hands out, so the order can be matched
 * to the account before the account has a key.
 */
export const machineOrderCustomerSchema = z
  .object({
    accountId: z.uuid(),
    sourceId: z.string().nullable(),
  })
  .strict();
export type MachineOrderCustomer = z.infer<typeof machineOrderCustomerSchema>;

/**
 * An ordered line, by the source system's own product key.
 *
 * `productSourceId` and not the slug: the receiving system knows its catalog by
 * the key it exported it under (FR-ADM-02), and the storefront's slug is a URL
 * that the shop may rename. The platform quotes no article number of its own —
 * there is none to quote.
 *
 * `pieces` is the quantity. `unit` and `quantity` are the **reading** the line
 * was bought through, frozen as it was shown (FR-UNIT-11), and nothing should
 * ever be derived from them: a line of two packs read as boxes is `0.2 bx` and
 * stays so after the product is repacked.
 */
export const machineOrderLineSchema = z
  .object({
    productSourceId: z.string(),
    /** As it read when the order was placed, not as the product reads now. */
    name: z.string(),
    unit: productUnitSchema,
    quantity: z.number().positive(),
    pieces: z.number().int().positive(),
    /** The price of one piece, as it was charged. */
    priceMinor: z.number().int().nonnegative(),
    lineTotalMinor: z.number().int().nonnegative(),
    /** What the customer typed against this line, where they typed anything. */
    note: z.string().nullable(),
  })
  .strict();
export type MachineOrderLine = z.infer<typeof machineOrderLineSchema>;

/**
 * One order, read as the version it currently stands at (FR-ORD-03, ADR 0051).
 *
 * The **whole** version, not a header: an order's content lives on its
 * revisions, and a reader that had to assemble one from two places would be
 * the second implementation of a thing the platform already answers in one.
 * Superseded versions are not offered — what is worked outside is the order as
 * it stands, and its history is the shop's record of how it got there.
 *
 * `revisionNumber` is the point of it. It names what was read, so a write-back
 * answers a version rather than guessing at one (FR-ADM-08), and two systems
 * cannot write over each other without one of them being told.
 *
 * What is deliberately **not** here: the shipment estimate and the delivery
 * zone, both of which are this platform's own arithmetic over config the
 * receiving system does not have and did not price anything with; the guest's
 * mailed link, which is that customer's credential and not a second way in;
 * and the order's documents, which are their own surface (FR-ORD-05).
 */
export const machineOrderSchema = z
  .object({
    /** What the order is quoted by, everywhere, and what a write-back
     * addresses. It survives every version of the order. */
    reference: z.string(),
    status: orderStatusSchema,
    /** The second axis (FR-ORD-04): what has been received, which is a fact
     * about the order today rather than about the version being read. */
    paymentState: paymentStateSchema,
    /** Which version this is. 1 is the order as the customer submitted it. */
    revisionNumber: z.number().int().positive(),
    /** Null on a guest order. */
    customer: machineOrderCustomerSchema.nullable(),
    contact: orderContactSchema,
    /** Who it is invoiced to, as the order froze it (FR-CART-09). */
    party: orderingPartySchema,
    fulfilmentMethod: fulfilmentMethodSchema,
    paymentMethod: paymentMethodSchema,
    /** Set on a delivery, null on a pickup. */
    deliveryAddress: orderAddressSchema.nullable(),
    /** Set on a pickup, null on a delivery. */
    pickup: orderPickupSchema.nullable(),
    /** Null where the deployment invoices no address of its own. */
    billingAddress: orderAddressSchema.nullable(),
    /** The day the customer asked for (FR-CART-07). A wish, never a promise:
     * scheduling is agreed by phone or mail. */
    preferredDate: z.iso.date().nullable(),
    /** The customer's own words. Theirs: a write-back never overwrites it. */
    customerNote: z.string().nullable(),
    /** Why it was declined or called off (FR-ORD-02), null on every other
     * status. */
    statusReason: z.string().nullable(),
    /**
     * Who called it off, null unless the order is `cancelled`.
     *
     * The one thing an adapter cannot work out for itself and must not guess.
     * `customer` is the account cancelling their own order, which they may do
     * however the area is owned (FR-ADM-10) and which no writer may drive
     * forward over the top. `shop` is the back office stopping it — including
     * an owning system's own cancellation, which is that system's work and its
     * to take back. A declined order says null: a refusal is always the
     * shop's, and `statusReason` is the whole of what there is to read.
     */
    cancelledBy: z.enum(['customer', 'shop']).nullable(),
    /** What the shop said about this version, where it was written to say
     * anything — null on a submission and on a plain move. */
    note: z.string().nullable(),
    /** Which price list it was taken from; null is the default one. */
    tierKey: z.string().nullable(),
    lines: z.array(machineOrderLineSchema),
    totalMinor: z.number().int().nonnegative(),
    currency: z.string(),
    createdAt: z.iso.datetime(),
    /** When the order last moved between states (FR-ORD-01). */
    statusChangedAt: z.iso.datetime(),
    /** When the money was recorded as received, null until it was. */
    paidAt: z.iso.datetime().nullable(),
    /** Anything at all last happened to this order. What `since` and the
     * ordering are measured on. */
    updatedAt: z.iso.datetime(),
  })
  .strict();
export type MachineOrder = z.infer<typeof machineOrderSchema>;

// --- Paging --------------------------------------------------------------

/**
 * A page of orders, oldest change first — the same shape as the customer read
 * (FR-ADM-18), because it answers the same question: "everything that has moved
 * since I last asked".
 *
 * Ordered on the order's last change rather than on when it was placed. A
 * puller that walked creation order would have to re-read the whole book to
 * notice that yesterday's order was cancelled this morning.
 */
export const listMachineOrdersQuerySchema = z
  .object({
    /** Orders changed at or after this moment. Omitted reads from the
     * beginning, which is what a first run wants. Inclusive: re-reading one
     * order is harmless, and missing one is not. */
    since: z.iso.datetime().optional(),
    /** `nextCursor` from the previous page, verbatim. */
    cursor: z.string().trim().min(1).max(200).optional(),
    limit: z.coerce
      .number()
      .int()
      .positive()
      .max(ORDER_READ_MAX_LIMIT)
      .default(ORDER_READ_MAX_LIMIT),
  })
  .strict();
export type ListMachineOrdersQuery = z.infer<
  typeof listMachineOrdersQuerySchema
>;

export const machineOrdersPageSchema = z
  .object({
    orders: z.array(machineOrderSchema),
    /**
     * Where to carry on, or null at the end of the list.
     *
     * Opaque on purpose: it encodes the ordering, and a client that took it
     * apart would break the day the ordering gained a tiebreak. The honest
     * resumption point across runs is the last order's own `updatedAt`, fed
     * back as `since`.
     */
    nextCursor: z.string().nullable(),
  })
  .strict();
export type MachineOrdersPage = z.infer<typeof machineOrdersPageSchema>;

// --- The routes ----------------------------------------------------------

const machineRead = oc.errors({
  ...machineAuthErrors,
  /** A cursor this route did not issue, or one from an incompatible ordering.
   * Its own refusal rather than a silent restart from the top: a puller that
   * quietly began again would re-read every order and never say why. */
  'invalid-cursor': { status: 400 },
});

export const machineOrderReadContract = {
  listOrders: machineRead
    .route({
      method: 'GET',
      path: '/machine/orders',
      inputStructure: 'detailed',
      summary: 'Read orders (machine)',
    })
    .input(z.object({ query: listMachineOrdersQuerySchema }))
    .output(machineOrdersPageSchema),

  /**
   * One order, fresh.
   *
   * Beside the list rather than instead of a re-read of it, because the one
   * moment a client most needs a single order is when a write-back has just
   * been refused for naming a version the order has moved past (FR-ADM-08):
   * walking the whole feed again to find out what it moved to is a poor answer
   * to "what does it say now".
   */
  getOrder: machineRead
    .errors({
      /** No order of that reference. The same answer as an order that exists
       * and is not this shop's to show, of which there are none — every order
       * is readable, whoever owns the area. */
      'order-not-found': { status: 404 },
    })
    .route({
      method: 'GET',
      path: '/machine/orders/{reference}',
      inputStructure: 'detailed',
      summary: 'Read one order (machine)',
    })
    .input(z.object({ params: z.object({ reference: z.string() }) }))
    .output(machineOrderSchema),
};
