import * as z from 'zod';
import {
  FULFILMENT_METHODS,
  MY_ORDER_FILTERS,
  ORDER_NOTE_MAX,
  ORDER_STATUSES,
  PARTY_NAME_MAX,
  PAYMENT_METHODS,
  PAYMENT_STATES,
  PICKUP_LOCATION_KEY_MAX,
} from './orders';
import { ORDER_DOCUMENT_KINDS } from './order-documents';
import { TAX_BASES } from '../../lib/core/tax';
import {
  addressInputSchema,
  countryCodeSchema,
} from '../accounts/address.contract';
import {
  companyRegistrationIdSchema,
  lowercaseEmailField,
} from '../../lib/config/contact-config';
import { cartLineSchema, cartPreviewSchema } from './cart.contract';
import { CART_LINES_MAX } from './cart';
import {
  catalogImageSchema,
  productUnitSchema,
} from '../catalog/catalog.contract';
import { honeypotField } from '../../platform/form-fields.contract';

/**
 * An order is a request (FR-CART-03): priced, recorded and mailed, and
 * confirmed by a manager. Nothing here charges anybody.
 */

export const orderStatusSchema = z.enum(ORDER_STATUSES);
export type OrderStatus = z.infer<typeof orderStatusSchema>;

export const fulfilmentMethodSchema = z.enum(FULFILMENT_METHODS);
export type FulfilmentMethod = z.infer<typeof fulfilmentMethodSchema>;

export const paymentMethodSchema = z.enum(PAYMENT_METHODS);
export type PaymentMethod = z.infer<typeof paymentMethodSchema>;

export const paymentStateSchema = z.enum(PAYMENT_STATES);
export type PaymentState = z.infer<typeof paymentStateSchema>;

export const myOrderFilterSchema = z.enum(MY_ORDER_FILTERS);
export type MyOrderFilter = z.infer<typeof myOrderFilterSchema>;

/**
 * The party an order is invoiced to (FR-CART-09). Not part of the billing
 * address: one party invoiced at another's address is an ordinary order.
 */
export const orderingPartySchema = z
  .object({
    name: z.string().trim().min(1).max(PARTY_NAME_MAX),
    /** Null for a person; a company's is checked against the deployment's
     * formats. */
    registrationId: companyRegistrationIdSchema.nullable(),
  })
  .strict();
export type OrderingParty = z.infer<typeof orderingPartySchema>;

/** Kept on the order: a guest has no account, and a customer may name a
 * colleague. */
export const orderContactSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    email: lowercaseEmailField(255),
    phone: z.string().trim().min(1).max(50),
  })
  .strict();
export type OrderContact = z.infer<typeof orderContactSchema>;

/** Delivery needs an address and no pickup point; pickup the other way round. */
export function hasOneDestination(order: {
  fulfilmentMethod: FulfilmentMethod;
  deliveryAddress: unknown;
  pickupLocationKey: string | null;
}): boolean {
  return order.fulfilmentMethod === 'delivery'
    ? order.deliveryAddress !== null && order.pickupLocationKey === null
    : order.deliveryAddress === null && order.pickupLocationKey !== null;
}

export const DESTINATION_MESSAGE =
  'fulfilment needs exactly its own destination';

/**
 * The submission (FR-CART-03). `expectedTotalMinor` is a comparand, never an
 * input: the server prices the cart itself and refuses when the two disagree.
 */
export const orderSubmissionSchema = z
  .object({
    lines: z.array(cartLineSchema).min(1).max(CART_LINES_MAX),
    contact: orderContactSchema,
    fulfilmentMethod: fulfilmentMethodSchema,
    /** Null for the party the account is registered as, which the server
     * resolves; a guest's is never null. */
    party: orderingPartySchema.nullable(),
    deliveryAddress: addressInputSchema.nullable(),
    pickupLocationKey: z
      .string()
      .trim()
      .min(1)
      .max(PICKUP_LOCATION_KEY_MAX)
      .nullable(),
    /** Null where the deployment invoices no address of its own; never "the
     * delivery one". */
    billingAddress: addressInputSchema.nullable(),
    paymentMethod: paymentMethodSchema,
    /** A wish, not a booking (FR-CART-07). */
    preferredDate: z.iso.date().nullable(),
    customerNote: z.string().trim().min(1).max(ORDER_NOTE_MAX).nullable(),
    expectedTotalMinor: z.number().int().nonnegative(),
    website: honeypotField,
  })
  .strict()
  .refine(hasOneDestination, { message: DESTINATION_MESSAGE });
export type OrderSubmission = z.infer<typeof orderSubmissionSchema>;

/**
 * A line as ordered, frozen. `slug` is the product's current one where
 * `linked`; otherwise the snapshot, shown as plain words rather than a 404.
 */
export const orderLineSchema = z
  .object({
    name: z.string(),
    slug: z.string(),
    /** False once the product is unpublished or deleted. */
    linked: z.boolean(),
    image: catalogImageSchema.nullable(),
    unit: productUnitSchema,
    /** `pieces` read through `unit` when the order was placed: a display
     * snapshot that survives repacking. `pieces` is what was ordered. */
    quantity: z.number().positive(),
    pieces: z.number().int().positive(),
    lineTotalMinor: z.number().int().nonnegative(),
    /** The rate when its version was written (NFR-LEGAL-11); null where no tax
     * is charged. */
    taxRate: z.number().nullable(),
    note: z.string().nullable(),
  })
  .strict();
export type OrderLine = z.infer<typeof orderLineSchema>;

export const orderSummarySchema = z
  .object({
    reference: z.string(),
    status: orderStatusSchema,
    /** "Accepted, still unpaid" is a row a manager scans for (FR-ORD-04). */
    paymentState: paymentStateSchema,
    /** The status badge reads through it: `ready` for pickup or delivery. */
    fulfilmentMethod: fulfilmentMethodSchema,
    createdAt: z.iso.datetime(),
    totalMinor: z.number().int().nonnegative(),
    currency: z.string(),
    itemCount: z.number().int().nonnegative(),
  })
  .strict();
export type OrderSummary = z.infer<typeof orderSummarySchema>;

/** The address as the order froze it: no id, no timestamps, nothing to edit. */
export const orderAddressSchema = z
  .object({
    street: z.string(),
    street2: z.string().nullable(),
    postalCode: z.string(),
    city: z.string(),
    region: z.string().nullable(),
    country: countryCodeSchema,
  })
  .strict();
export type OrderAddress = z.infer<typeof orderAddressSchema>;

/** The pickup point as it read at the time: config is editable. */
export const orderPickupSchema = z
  .object({
    key: z.string(),
    name: z.string(),
    address: z.string(),
  })
  .strict();
export type OrderPickup = z.infer<typeof orderPickupSchema>;

/** The zone resolved from the address (FR-CART-07). Advisory: it never
 * blocked or priced the order. */
export const orderDeliveryZoneSchema = z
  .object({
    key: z.string(),
    freeFromMinor: z.number().int().nonnegative().nullable(),
  })
  .strict();

/**
 * A document the reader can open (FR-ORD-05, ADR 0052): what exists, not what
 * could. The bytes come from `orderDocumentPath`.
 */
export const orderDocumentSchema = z
  .object({
    kind: z.enum(ORDER_DOCUMENT_KINDS),
    /** A supplied file replaces the generated one entirely. */
    source: z.enum(['generated', 'supplied']),
    fileName: z.string(),
    contentType: z.string(),
    /** Null for a generated one: nothing is stored until it is drawn. */
    byteSize: z.number().int().positive().nullable(),
    suppliedAt: z.iso.datetime().nullable(),
  })
  .strict();
export type OrderDocument = z.infer<typeof orderDocumentSchema>;

export const orderDetailSchema = orderSummarySchema.extend({
  contact: orderContactSchema,
  /** As it read when placed, resolved from the account where none was named. */
  party: orderingPartySchema,
  deliveryAddress: orderAddressSchema.nullable(),
  pickup: orderPickupSchema.nullable(),
  deliveryZone: orderDeliveryZoneSchema.nullable(),
  billingAddress: orderAddressSchema.nullable(),
  paymentMethod: paymentMethodSchema,
  preferredDate: z.iso.date().nullable(),
  customerNote: z.string().nullable(),
  /** Why it was declined or called off (FR-ORD-02). */
  statusReason: z.string().nullable(),
  /** When the accepted terms were last changed (NFR-LEGAL-10); null where it
   * accepted none. */
  termsDate: z.iso.datetime().nullable(),
  /** The basis it was submitted under (NFR-LEGAL-11), not today's. */
  taxBasis: z.enum(TAX_BASES),
  /**
   * The shop's notes on every change up to the version shown (FR-ORD-03),
   * oldest first. All of them, so the page says what the mail said.
   */
  changes: z.array(z.string()),
  lines: z.array(orderLineSchema),
  shipment: cartPreviewSchema.shape.shipment,
  documents: z.array(orderDocumentSchema),
});
export type OrderDetail = z.infer<typeof orderDetailSchema>;

/**
 * Refusals about the order itself, shared by checkout and adjustment: an order
 * a customer could not have placed is not one staff may write either.
 */
export const orderDetailErrors = {
  'invalid-company-id': { status: 400 },
  'unsupported-country': { status: 400 },
  'invalid-postal-code': { status: 400 },
  'unknown-pickup-location': { status: 400 },
  /** Bank transfer invoices a legal entity, so it needs a registration
   * number. */
  'billing-details-required': { status: 400 },
  /** A company is invoiced (FR-CART-04). */
  'cash-not-available': { status: 400 },
  'billing-address-required': { status: 400 },
  /** A kind of customer the shop does not sell to (FR-AUTH-13). */
  'customer-type-not-accepted': { status: 400 },
} as const;

/** A reference the caller may not read answers as one that does not exist. */
export const orderNotFound = { 'order-not-found': { status: 404 } } as const;

/** The personal details were removed (NFR-LEGAL-14): nothing moves, changes or
 * writes about the order again. */
export const detailsRemoved = {
  'personal-data-removed': { status: 409 },
} as const;

/**
 * Everything a transition can be refused for (FR-ORD-02).
 * `transition-not-allowed` is one answer for "never this actor's move" and
 * "not from here": telling which tells a customer about states they cannot see.
 */
export const transitionErrors = {
  ...orderNotFound,
  ...detailsRemoved,
  'transition-not-allowed': { status: 409 },
  /** Declining or cancelling says why; the customer's mail quotes it. */
  'reason-required': { status: 400 },
} as const;
