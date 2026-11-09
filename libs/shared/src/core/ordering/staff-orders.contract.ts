import * as z from 'zod';

import { addressInputSchema } from '../accounts/address.contract';
import { productUnitSchema } from '../catalog/catalog.contract';
import { CART_NOTE_MAX, LINE_PIECES_MAX } from '../catalog/product-units';
import { TAX_BASES } from '../catalog/tax';
import { CART_LINES_MAX } from './cart';
import { cartPreviewSchema } from './cart.contract';
import {
  ORDER_ADJUSTMENT_NOTE_MAX,
  ORDER_NOTICES,
  ORDER_REVISION_KINDS,
  ORDER_STATUS_REASON_MAX,
  PICKUP_LOCATION_KEY_MAX,
  STAFF_ORDER_SORTS,
  STAFF_PAYMENT_FILTERS,
} from './orders';
import {
  DESTINATION_MESSAGE,
  fulfilmentMethodSchema,
  hasOneDestination,
  orderContactSchema,
  orderDetailSchema,
  orderDocumentSchema,
  orderingPartySchema,
  orderLineSchema,
  orderStatusSchema,
  paymentMethodSchema,
} from './orders.contract';

/**
 * The order as staff read and change it. In core rather than admin because the
 * one order writer produces these for staff, the mails and the exchange alike.
 */

export const orderRevisionKindSchema = z.enum(ORDER_REVISION_KINDS);
export type OrderRevisionKind = z.infer<typeof orderRevisionKindSchema>;

/** Not on the wire: the API decides it from the move, and the mail is written
 * from it. */
export const orderNoticeSchema = z.enum(ORDER_NOTICES);
export type OrderNotice = z.infer<typeof orderNoticeSchema>;

export const staffOrderSortSchema = z.enum(STAFF_ORDER_SORTS);
export type StaffOrderSort = z.infer<typeof staffOrderSortSchema>;

export const staffPaymentFilterSchema = z.enum(STAFF_PAYMENT_FILTERS);
export type StaffPaymentFilter = z.infer<typeof staffPaymentFilterSchema>;

/** With the piece price charged, so a line reconciles against the source
 * system. */
export const adminOrderLineSchema = orderLineSchema.extend({
  priceMinor: z.number().int().nonnegative(),
});
export type AdminOrderLine = z.infer<typeof adminOrderLineSchema>;

/** A supplied file is filed as given, so a later version may have moved the
 * total it quotes. */
export const adminOrderDocumentSchema = orderDocumentSchema.extend({
  /** Null on a generated one, which states its own version. */
  suppliedForRevision: z.number().int().positive().nullable(),
  /** Changed since it was supplied: a warning, never a refusal. */
  outdated: z.boolean(),
  /** When the customer was last written to about it. */
  notifiedAt: z.iso.datetime().nullable(),
});
export type AdminOrderDocument = z.infer<typeof adminOrderDocumentSchema>;

/** What the customer must never see: the price list, who placed it, and each
 * line's price. */
export const adminOrderDetailSchema = orderDetailSchema.extend({
  lines: z.array(adminOrderLineSchema),
  documents: z.array(adminOrderDocumentSchema),
  /** Null for a guest order. */
  customerEmail: z.string().nullable(),
  /** The guest's mailed link (FR-NOTIF-06), so staff open what the caller is
   * looking at. Never rendered to a customer. */
  publicToken: z.string().nullable(),
  /** Null is the default list. */
  tierKey: z.string().nullable(),
  /** The page version behind `termsDate`. */
  termsVersion: z.number().int().positive().nullable(),
  statusChangedAt: z.iso.datetime(),
  /** The version shown; an adjustment sends it back, so two
   * managers cannot overwrite each other. */
  revisionNumber: z.number().int().positive(),
  /** The version the customer's page reads (FR-NOTIF-03): behind after an
   * untold change or a move kept off their page. */
  customerRevisionNumber: z.number().int().positive(),
  /** The last version they were written to about; 0 for none. Not the one
   * they look at: a move can reach their page without a mail. */
  notifiedRevisionNumber: z.number().int().nonnegative(),
  /** What `notifyByDefault` reads: a second lap through a state is not news. */
  notifiedStatuses: z.array(orderStatusSchema),
  paidAt: z.iso.datetime().nullable(),
  /** When its personal details were removed (NFR-LEGAL-14). */
  personalDataRemovedAt: z.iso.datetime().nullable(),
});
export type AdminOrderDetail = z.infer<typeof adminOrderDetailSchema>;

/**
 * One version as staff read it back: the whole snapshot, with its
 * own status. Payment and documents are not versioned; each document is
 * marked `outdated` against the version it is read beside.
 */
export const orderRevisionSchema = adminOrderDetailSchema.extend({
  revisionCreatedAt: z.iso.datetime(),
  /** Null for the customer's submission and for anything written back. */
  author: z.string().nullable(),
  /** An owning system's own name for whoever acted (FR-ADM-08). A string,
   * never matched onto an account here. */
  source: z.string().nullable(),
  kind: orderRevisionKindSchema,
  /** The shop's note on this version; null on any that is not a change. */
  note: z.string().nullable(),
  /** Whether this is the version the customer is shown. */
  customerView: z.boolean(),
  /** When the customer was written to about it. */
  notifiedAt: z.iso.datetime().nullable(),
});
export type OrderRevision = z.infer<typeof orderRevisionSchema>;

/** The timeline lists what happened, not what can be opened: marking every
 * file against every version is a query per row nobody reads. */
export const orderRevisionEntrySchema = orderRevisionSchema.omit({
  documents: true,
});
export type OrderRevisionEntry = z.infer<typeof orderRevisionEntrySchema>;

/** A line as a manager adjusts it (FR-ORD-03), in pieces. */
export const orderAdjustmentLineSchema = z
  .object({
    slug: z.string().trim().min(1).max(255),
    pieces: z.number().int().positive().max(LINE_PIECES_MAX),
    /** Null on a line staff added. */
    unit: productUnitSchema.nullable(),
    /** The customer's words, carried unedited. */
    note: z.string().trim().min(1).max(CART_NOTE_MAX).nullable(),
    /** One piece's price to keep, or null for today's list price. */
    priceMinor: z.number().int().nonnegative().nullable(),
  })
  .strict();
export type OrderAdjustmentLine = z.infer<typeof orderAdjustmentLineSchema>;

/**
 * The order as a manager proposes it should now read (FR-ORD-03): a whole
 * snapshot, because what is written is a new version. The customer's own
 * words are carried by the server and cannot be sent. `basedOnRevision`
 * keeps a second manager from silently discarding the first.
 */
export const orderAdjustmentSchema = z
  .object({
    lines: z.array(orderAdjustmentLineSchema).min(1).max(CART_LINES_MAX),
    contact: orderContactSchema,
    /** Stated, never resolved: staff are not the account. */
    party: orderingPartySchema,
    fulfilmentMethod: fulfilmentMethodSchema,
    deliveryAddress: addressInputSchema.nullable(),
    pickupLocationKey: z
      .string()
      .trim()
      .min(1)
      .max(PICKUP_LOCATION_KEY_MAX)
      .nullable(),
    billingAddress: addressInputSchema.nullable(),
    paymentMethod: paymentMethodSchema,
    /** The list unpriced lines are taken from (FR-CART-09); null is the
     * default. */
    tierKey: z.string().trim().min(1).max(64).nullable(),
    note: z.string().trim().min(1).max(ORDER_ADJUSTMENT_NOTE_MAX).nullable(),
    /** Off by default: the change is usually confirmed by the move that
     * follows it (FR-NOTIF-03). */
    notify: z.boolean().default(false),
    basedOnRevision: z.number().int().positive(),
  })
  .strict()
  .refine(hasOneDestination, { message: DESTINATION_MESSAGE });
export type OrderAdjustment = z.infer<typeof orderAdjustmentSchema>;

/**
 * Advisory: staff may put a withdrawn product on an order. The customer's
 * piece rules are not among them.
 */
export const adjustmentLineFlagSchema = z.enum([
  'out-of-stock',
  'unpublished',
  'deleted',
]);
export type AdjustmentLineFlag = z.infer<typeof adjustmentLineFlagSchema>;

/** The proposed order priced by the write's own arithmetic, without writing:
 * a screen must not work a total out for itself. */
export const orderAdjustmentPreviewSchema = z
  .object({
    lines: z.array(
      adminOrderLineSchema.extend({
        flags: z.array(adjustmentLineFlagSchema),
        /** Today's list price beside the line's, so a screen can say a price
         * is deliberate without pricing anything. */
        listPriceMinor: z.number().int().nonnegative().nullable(),
      }),
    ),
    totalMinor: z.number().int().nonnegative(),
    currency: z.string(),
    /** The order's own: an adjustment never changes it. */
    taxBasis: z.enum(TAX_BASES),
    /** Re-resolved from the address as it now reads. */
    deliveryZone: orderDetailSchema.shape.deliveryZone,
    shipment: cartPreviewSchema.shape.shipment,
  })
  .strict();
export type OrderAdjustmentPreview = z.infer<
  typeof orderAdjustmentPreviewSchema
>;

export const orderTransitionSchema = z
  .object({
    // Any status; whether it is allowed from here is the transition table's.
    to: orderStatusSchema,
    /** Required for the two endings, null otherwise. */
    reason: z.string().trim().min(1).max(ORDER_STATUS_REASON_MAX).nullable(),
    /** Stated on every move (FR-NOTIF-03): only the person clicking knows
     * whether it is news. `notifyByDefault` offers an answer. */
    notify: z.boolean(),
    /** Whether the customer's page moves to this version: no for a step taken
     * by mistake and straight back. A mail needs it. */
    showCustomer: z.boolean(),
    /** The cash handover, one event in one click (FR-ORD-04). Refused on an
     * ending, ignored where already paid. */
    markPaid: z.boolean(),
  })
  .strict()
  .refine((move) => move.showCustomer || !move.notify, {
    message: 'a mail can only be about a version the customer is shown',
    path: ['notify'],
  });
export type OrderTransition = z.infer<typeof orderTransitionSchema>;
