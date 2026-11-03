import * as z from 'zod';
import {
  ORDER_ADJUSTMENT_NOTE_MAX,
  ORDER_NOTICES,
  ORDER_REVISION_KINDS,
  ORDER_STATUS_REASON_MAX,
  PICKUP_LOCATION_KEY_MAX,
  STAFF_ORDER_SORTS,
  STAFF_PAYMENT_FILTERS,
} from './order-constants';
import { TAX_BASES } from '../../lib/core/tax';
import { cartPreviewSchema, productUnitSchema } from './cart.contract';
import { CART_LINES_MAX } from './cart-constants';
import { CART_NOTE_MAX, LINE_PIECES_MAX } from '../catalog/product-units';
import {
  fulfilmentMethodSchema,
  orderAddressInputSchema,
  orderContactSchema,
  orderDeliveryZoneSchema,
  orderDetailSchema,
  orderDocumentSchema,
  orderLineSchema,
  orderStatusSchema,
  orderingPartySchema,
  paymentMethodSchema,
} from './orders.contract';

/** Why a version of an order exists (FR-ORD-03). */
export const orderRevisionKindSchema = z.enum(ORDER_REVISION_KINDS);
export type OrderRevisionKind = z.infer<typeof orderRevisionKindSchema>;
/** What a message to the customer is about (FR-NOTIF-03). Not on the wire:
 * the API decides it from the move it just made, and the mail is written from
 * it. Named here so the mail and the transition read one vocabulary. */
export const orderNoticeSchema = z.enum(ORDER_NOTICES);
export type OrderNotice = z.infer<typeof orderNoticeSchema>;
export const staffOrderSortSchema = z.enum(STAFF_ORDER_SORTS);
export type StaffOrderSort = z.infer<typeof staffOrderSortSchema>;
/** How the payment column is narrowed, for staff only (FR-ORD-04). */
export const staffPaymentFilterSchema = z.enum(STAFF_PAYMENT_FILTERS);
export type StaffPaymentFilter = z.infer<typeof staffPaymentFilterSchema>;
/**
 * What a manager may move an order to (FR-ORD-02) — every status there is,
 * `requested` included, since reopening an ended order is a move like any
 * other. Whether it is allowed from where the order stands is the transition
 * table's answer, not this enum's.
 */
export const transitionTargetSchema = orderStatusSchema;
export type TransitionTarget = z.infer<typeof transitionTargetSchema>;
/**
 * The same line as staff read it: with the piece price it was charged at, so a
 * line reconciles as "pieces × price" against the source system. Neither view
 * carries the product's private source id.
 */
export const adminOrderLineSchema = orderLineSchema.extend({
  priceMinor: z.number().int().nonnegative(),
});
export type AdminOrderLine = z.infer<typeof adminOrderLineSchema>;
/**
 * The staff view of the same list. It adds the one thing only staff can act
 * on: a supplied file is filed as given and nothing checks it against the
 * order, so a version written after it arrived may have moved the total it
 * quotes.
 */
export const adminOrderDocumentSchema = orderDocumentSchema.extend({
  /** The version the order stood on when the file was supplied; null on a
   * generated one, which always states the version it was drawn from. */
  suppliedForRevision: z.number().int().positive().nullable(),
  /** Whether the order has been changed since — a warning, never a refusal. */
  outdated: z.boolean(),
  /** When the customer was last written to about this document, null where
   * they never were. What a screen reads to say whether the shop still owes
   * them the message. */
  notifiedAt: z.iso.datetime().nullable(),
});
export type AdminOrderDocument = z.infer<typeof adminOrderDocumentSchema>;
/**
 * The staff view. It adds what the customer must never see: which price list
 * the order was taken from, who placed it, and the price each line was
 * charged at.
 */
export const adminOrderDetailSchema = orderDetailSchema.extend({
  lines: z.array(adminOrderLineSchema),
  documents: z.array(adminOrderDocumentSchema),
  /** Null for a guest order — nothing to open, which is the point. */
  customerEmail: z.string().nullable(),
  /**
   * The link a guest was mailed (FR-NOTIF-06), so staff can open exactly what
   * that customer is looking at when they ring about it. Null on an order
   * placed from an account: that customer reads it signed in, and the version
   * they are shown is already a link on this screen.
   *
   * Staff-only, and it goes no further: nothing renders it to a customer, and
   * the token remains the guest's own credential rather than a second way in.
   */
  publicToken: z.string().nullable(),
  /** Which list it was priced from; null means the default one. */
  tierKey: z.string().nullable(),
  /** The page version behind `termsDate`, as the page editor numbers it. */
  termsVersion: z.number().int().positive().nullable(),
  statusChangedAt: z.iso.datetime(),
  /** Which version is being shown (ADR 0051). 1 is the order as the customer
   * submitted it; every move and every adjustment writes the next. What a
   * screen sends back when it adjusts, so two managers cannot overwrite each
   * other. */
  revisionNumber: z.number().int().positive(),
  /**
   * Which version the customer's own page reads (FR-NOTIF-03).
   *
   * Equal to `revisionNumber` on the ordinary order, whose every move the
   * customer's page followed. Behind it after a change nobody has been told
   * about yet, and after a move somebody deliberately kept off their page.
   */
  customerRevisionNumber: z.number().int().positive(),
  /**
   * The last version the customer was actually written to about
   * (FR-NOTIF-03), or 0 on an order no mail has ever gone out for.
   *
   * A different question from `customerRevisionNumber`, which is what they are
   * *looking at*: a move can put a version on their page without a word going
   * with it.
   */
  notifiedRevisionNumber: z.number().int().nonnegative(),
  /**
   * The statuses the customer has already been written to about, in no
   * particular order. What the screen offers the "write to them" tick for by
   * default (`notifyByDefault`): a step forward into a state they have never
   * heard about is news, and a second lap through one is not.
   */
  notifiedStatuses: z.array(orderStatusSchema),
  /** When the money was recorded as received, null until it was. Who recorded
   * it is kept on the row for the record but not served: nothing on this
   * screen asks, and it would cost a join on every read. */
  paidAt: z.iso.datetime().nullable(),
  /** When the personal details on this order were removed (NFR-LEGAL-14):
   * its account was deleted, its retention ended, or a guest asked. Null
   * while it still carries them. */
  personalDataRemovedAt: z.iso.datetime().nullable(),
});
export type AdminOrderDetail = z.infer<typeof adminOrderDetailSchema>;
/**
 * One version of an order as staff read it back (FR-ORD-03, ADR 0051) — the
 * whole snapshot, so a superseded version is read exactly like a current one
 * and the two can be compared without either being described specially.
 *
 * `status` is the version's own — every move writes one, so a version says
 * where the order stood when it was written and the thread reads as the
 * order's history. Payment is not versioned: what has been received is a fact
 * about the order today, whichever version is being looked at. Nor are the
 * documents: an order's files are the order's, and each is marked `outdated`
 * against the version it is being read beside — so staff reading an old
 * version see it stated from where they are standing.
 */
export const orderRevisionSchema = adminOrderDetailSchema.extend({
  /** When this version was written, and by whom — null for the one the
   * customer submitted, and for anything an outside system writes back. */
  revisionCreatedAt: z.iso.datetime(),
  author: z.string().nullable(),
  /**
   * Who wrote it from outside, where an owning system did (FR-ADM-08): that
   * system's own name for whoever acted, or the credential that spoke for
   * them. Null on everything written in this shop.
   *
   * Beside `author` rather than instead of it, and never resolved to an
   * account: a name from another system is a string, and matching it onto
   * somebody here would put one person's name on another's work.
   */
  source: z.string().nullable(),
  /** Why it was written: placed, moved, or changed. */
  kind: orderRevisionKindSchema,
  /** What the shop said about *this* version, in their words — null on every
   * version that is not a change. The order's `changes` is the running account
   * the customer reads; this is the one entry the thread hangs on this row. */
  note: z.string().nullable(),
  /** Whether this is the version the customer is being shown. */
  customerView: z.boolean(),
  /** When the customer was written to about this version (FR-NOTIF-03), null
   * where they never were. Not the same question as `customerView`: a version
   * can become theirs without a mail, and a version they were mailed about is
   * superseded the moment the next one is written. */
  notifiedAt: z.iso.datetime().nullable(),
});
export type OrderRevision = z.infer<typeof orderRevisionSchema>;
/**
 * A version in the thread, where the documents are deliberately absent: the
 * timeline lists what happened to the order, not what can be opened on it, and
 * marking every file against every version an order has ever had is a query
 * per row for something no screen reads.
 */
export const orderRevisionEntrySchema = orderRevisionSchema.omit({
  documents: true,
});
export type OrderRevisionEntry = z.infer<typeof orderRevisionEntrySchema>;
/**
 * A line as a manager adjusts it (FR-ORD-03).
 *
 * Counted in **pieces**, which is how staff read a line and how the source
 * system prices one. The lens the customer chose only reads that count back.
 *
 * A null price asks the server to price the line from the order's list at
 * today's catalog price, which is what a newly added line needs; a price set is
 * the one this line is to keep, whether that is the one it was quoted at or the
 * one agreed on the phone.
 */
export const orderAdjustmentLineSchema = z
  .object({
    slug: z.string().trim().min(1).max(255),
    /** How many pieces of it. */
    pieces: z.number().int().positive().max(LINE_PIECES_MAX),
    /** The lens the customer reads it through, carried with the line. Null on
     * a line staff added, which nobody has read in any other unit yet. */
    unit: productUnitSchema.nullable(),
    /** The customer's words about this line, carried unedited. */
    note: z.string().trim().min(1).max(CART_NOTE_MAX).nullable(),
    /** The price of one piece, or null to take the list's. */
    priceMinor: z.number().int().nonnegative().nullable(),
  })
  .strict();
export type OrderAdjustmentLine = z.infer<typeof orderAdjustmentLineSchema>;
/**
 * The order as a manager is proposing it should now read (FR-ORD-03).
 *
 * A whole snapshot rather than a patch: what is written is a new version of
 * the order, and a version assembled from "the old one plus these three
 * fields" is a version nobody can point at. Everything the checkout asked is
 * here — and nothing the customer wrote in their own words, which is carried
 * forward by the server and cannot be sent at all.
 *
 * `basedOnRevision` is what the manager was looking at. Two people adjusting
 * one order both mean well and would otherwise both win, with the second
 * silently discarding the first.
 */
export const orderAdjustmentSchema = z
  .object({
    lines: z.array(orderAdjustmentLineSchema).min(1).max(CART_LINES_MAX),
    contact: orderContactSchema,
    /** Stated, never resolved: staff are not the account, and the party the
     * order is invoiced to is one of the things being adjusted. */
    party: orderingPartySchema,
    fulfilmentMethod: fulfilmentMethodSchema,
    deliveryAddress: orderAddressInputSchema.nullable(),
    pickupLocationKey: z
      .string()
      .trim()
      .min(1)
      .max(PICKUP_LOCATION_KEY_MAX)
      .nullable(),
    billingAddress: orderAddressInputSchema.nullable(),
    paymentMethod: paymentMethodSchema,
    /**
     * Which price list the lines with no price of their own are taken from
     * (FR-CART-09). Null is the default list. Changing it is how a
     * provisionally priced order is put right — it prices nothing on its own,
     * and a line keeps whatever price it carries.
     */
    tierKey: z.string().trim().min(1).max(64).nullable(),
    /** What the manager says changed. Optional here and asked for by the
     * screen: a system writing an adjustment back has nobody to ask. */
    note: z.string().trim().min(1).max(ORDER_ADJUSTMENT_NOTE_MAX).nullable(),
    /**
     * Whether to tell the customer now (FR-NOTIF-03).
     *
     * Off by default, and that is the point: the ordinary change is agreed on
     * the phone and then confirmed, and the confirmation is the one mail worth
     * sending. This is for the change with no move behind it — an address
     * corrected on an order already packed — where nothing else would ever
     * mention it.
     */
    notify: z.boolean().default(false),
    /** The version this was written against. */
    basedOnRevision: z.number().int().positive(),
  })
  .strict()
  .refine(
    (order) =>
      order.fulfilmentMethod === 'delivery'
        ? order.deliveryAddress !== null && order.pickupLocationKey === null
        : order.deliveryAddress === null && order.pickupLocationKey !== null,
    { message: 'fulfilment needs exactly its own destination' },
  );
export type OrderAdjustment = z.infer<typeof orderAdjustmentSchema>;
/**
 * What is worth saying about an adjusted line before it is written. Advisory
 * throughout: staff are answering an order, and a screen that refuses what the
 * shop has decided is a screen people work around.
 *
 * `unpublished` and `deleted` mark a product the storefront no longer offers,
 * which staff may still perfectly well put on an order — a line already on one
 * whose product has since been withdrawn, or one the shop is filling from
 * something it no longer lists.
 *
 * The piece rules are not among them: the minimum a *customer* may buy is not
 * a rule about what a manager may write down.
 */
export const adjustmentLineFlagSchema = z.enum([
  'out-of-stock',
  'unpublished',
  'deleted',
]);
export type AdjustmentLineFlag = z.infer<typeof adjustmentLineFlagSchema>;
/**
 * The proposed order, priced by the server — the same arithmetic the write
 * does, run without writing anything. A screen showing a manager what an
 * adjustment comes to must not work the total out for itself: two multipliers
 * disagreeing is exactly the bug the line-total check exists to prevent.
 */
export const orderAdjustmentPreviewSchema = z
  .object({
    lines: z.array(
      adminOrderLineSchema.extend({
        flags: z.array(adjustmentLineFlagSchema),
        /**
         * What the chosen price list charges for one piece of this product
         * today, beside what the line is actually priced at.
         *
         * It is what lets a screen say that a line is priced away from the
         * list without pricing anything itself: the comparison is between two
         * figures the server worked out, and a manager is told that the
         * difference is deliberate rather than left to spot it.
         */
        listPriceMinor: z.number().int().nonnegative().nullable(),
      }),
    ),
    totalMinor: z.number().int().nonnegative(),
    currency: z.string(),
    /** The order's own basis, which an adjustment never changes. */
    taxBasis: z.enum(TAX_BASES),
    /** Re-resolved from the address as it now reads (FR-CART-07). */
    deliveryZone: orderDeliveryZoneSchema.nullable(),
    shipment: cartPreviewSchema.shape.shipment,
  })
  .strict();
export type OrderAdjustmentPreview = z.infer<
  typeof orderAdjustmentPreviewSchema
>;
/** What a manager records, and what they say about it. */
export const orderTransitionSchema = z
  .object({
    to: transitionTargetSchema,
    /** Required for the two ways an order ends, null for every other move. */
    reason: z.string().trim().min(1).max(ORDER_STATUS_REASON_MAX).nullable(),
    /**
     * Whether to write to the customer about this move (FR-NOTIF-03).
     *
     * Stated on every move rather than worked out from the status, because the
     * mail is the half of a move nobody can take back and the platform is in
     * no position to guess: a step forward is usually news, an undo usually is
     * not, and only the person clicking knows which this is. The screen offers
     * an answer (`notifyByDefault`); a system writing a move back has to say
     * one.
     */
    notify: z.boolean(),
    /**
     * Whether the customer's own page moves to this version (FR-NOTIF-03).
     *
     * Almost always yes: a move is where the order *is*, and a page that lags
     * it tells the person waiting the wrong thing. The exception is a step
     * nobody outside the shop should ever have seen — `ready` clicked on the
     * wrong order and taken straight back, or the intermediate steps a source
     * system moves an order through that the adapter collapses — where showing
     * it would be announcing a mistake and then correcting it.
     *
     * A mail about a version the customer cannot open is a dead link, so
     * `notify` requires this.
     */
    showCustomer: z.boolean(),
    /**
     * Whether the money arrived with this move (FR-ORD-04) — the handover of a
     * cash order, which is one event and should not be two clicks.
     *
     * Only ever sets the payment; clearing a mis-tick is the payment route's
     * own job. Ignored where the order is already recorded as paid, and
     * refused on a move that ends an order, which owes nothing.
     */
    markPaid: z.boolean(),
  })
  .strict()
  .refine((move) => move.showCustomer || !move.notify, {
    message: 'a mail can only be about a version the customer is shown',
    path: ['notify'],
  });
export type OrderTransition = z.infer<typeof orderTransitionSchema>;
