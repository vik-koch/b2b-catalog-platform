import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import { addressInputSchema, countryCodeSchema } from './address.contract';
import { companyRegistrationIdSchema } from './contact-format';
import { apiErrorSchema, commonAuthErrorSchema } from './api-error';
import {
  CART_LINES_MAX,
  cartLineSchema,
  cartPreviewSchema,
  productUnitSchema,
} from './cart.contract';
import { catalogImageSchema, paginationSchema } from './catalog.contract';

const c = initContract();

/**
 * Placing an order request and reading it back (FR-CART-03/04/07, FR-ACC-01,
 * FR-NOTIF-06). An order is a **request**: it is priced, recorded and mailed,
 * and a manager confirms it. Nothing here charges anybody.
 */

/**
 * Where an order stands. Only `requested` is ever written today; the rest are
 * the transitions a manager gets later, listed now so the column's check
 * constraint and the read contract agree from the start.
 */
export const ORDER_STATUSES = [
  'requested',
  'approved',
  'declined',
  'cancelled',
] as const;
export const orderStatusSchema = z.enum(ORDER_STATUSES);
export type OrderStatus = z.infer<typeof orderStatusSchema>;

/** How the goods reach the customer. */
export const FULFILMENT_METHODS = ['delivery', 'pickup'] as const;
export const fulfilmentMethodSchema = z.enum(FULFILMENT_METHODS);
export type FulfilmentMethod = z.infer<typeof fulfilmentMethodSchema>;

/**
 * How it is paid. `card-later` is a card payment arranged with the manager
 * after confirmation — the platform takes no payment itself, which is why no
 * method here implies a transaction.
 */
export const PAYMENT_METHODS = ['cash', 'bank-transfer', 'card-later'] as const;
export const paymentMethodSchema = z.enum(PAYMENT_METHODS);
export type PaymentMethod = z.infer<typeof paymentMethodSchema>;

export const ORDER_NOTE_MAX = 1000;
/** A key from the deployment's `locations`, validated against it server-side. */
export const PICKUP_LOCATION_KEY_MAX = 64;

/**
 * Where an order goes, and where its invoice goes. The same shape as a saved
 * address, because that is what it usually is — a row picked out of the book,
 * or typed once by a guest who has no book.
 */
export const orderAddressInputSchema = addressInputSchema;
export type OrderAddressInput = z.infer<typeof orderAddressInputSchema>;

/** Registration numbers are compared in one form everywhere. */
export const PARTY_NAME_MAX = 255;

/**
 * The party an order is invoiced to (FR-CART-09): a name, and for a company a
 * registration number in one of the deployment's configured formats.
 *
 * Deliberately not part of the billing address. An order invoiced to one party
 * at another's address is an ordinary order, and folding the identity into the
 * address would either contradict what the customer picked or quietly rewrite
 * it. `null` on a submission means "the party this account is registered as",
 * which the server resolves — it is the account's own record, not something a
 * browser gets to assert.
 */
export const orderingPartySchema = z
  .object({
    name: z.string().trim().min(1).max(PARTY_NAME_MAX),
    /** Null for a natural person; required for a company, which the server
     * checks against the deployment's formats. */
    registrationId: companyRegistrationIdSchema.nullable(),
  })
  .strict();
export type OrderingParty = z.infer<typeof orderingPartySchema>;

/** Who to talk to about this order. Kept beside the addresses rather than read
 * off the account: a guest has no account, and a signed-in customer may want a
 * colleague called instead. */
export const orderContactSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    email: z.string().trim().toLowerCase().email().max(255),
    phone: z.string().trim().min(1).max(50),
  })
  .strict();
export type OrderContact = z.infer<typeof orderContactSchema>;

/**
 * The submission (FR-CART-03).
 *
 * `expectedTotalMinor` is a **comparand, never an input**: the server prices
 * the cart itself and refuses when the two disagree, so nobody can be booked
 * for a total they were never shown.
 *
 * Delivery and billing need not agree, and neither is typed as a *kind* of
 * address — `billing` is simply the one the invoice goes to, and it is the one
 * a company name and registration number belong to.
 */
export const orderSubmissionSchema = z
  .object({
    lines: z.array(cartLineSchema).min(1).max(CART_LINES_MAX),
    contact: orderContactSchema,
    fulfilmentMethod: fulfilmentMethodSchema,
    /**
     * Who the invoice is made out to, or null for the party the account is
     * registered as. A guest has no such record, so theirs is never null.
     */
    party: orderingPartySchema.nullable(),
    /** Required for delivery, absent for pickup. */
    deliveryAddress: orderAddressInputSchema.nullable(),
    /** Required for pickup, absent for delivery. */
    pickupLocationKey: z
      .string()
      .trim()
      .min(1)
      .max(PICKUP_LOCATION_KEY_MAX)
      .nullable(),
    billingAddress: orderAddressInputSchema,
    paymentMethod: paymentMethodSchema,
    /**
     * The day the customer would like it, ISO `YYYY-MM-DD`. A wish, not a
     * booking: scheduling is settled between customer and manager (FR-CART-07),
     * and nothing here reserves a slot. A date rather than free text because it
     * is one — a manager sorting by it, or a later screen showing this week's
     * requests, cannot do either with a sentence.
     */
    preferredDate: z.string().date().nullable(),
    customerNote: z.string().trim().min(1).max(ORDER_NOTE_MAX).nullable(),
    expectedTotalMinor: z.number().int().nonnegative(),
    /** FR-CART-03: the privacy notice has to be accepted, as on every other
     * form that sends personal data. */
    acceptPrivacy: z.literal(true),
    /** ADR 0015's honeypot: a bot fills it, a person never sees it. */
    website: z.string().max(200).optional(),
  })
  .strict()
  .refine(
    (order) =>
      order.fulfilmentMethod === 'delivery'
        ? order.deliveryAddress !== null && order.pickupLocationKey === null
        : order.deliveryAddress === null && order.pickupLocationKey !== null,
    { message: 'fulfilment needs exactly its own destination' },
  );
export type OrderSubmission = z.infer<typeof orderSubmissionSchema>;

/**
 * A line as it was ordered, frozen. The product's own fields are snapshots: a
 * later rename or price change must not rewrite what someone ordered.
 *
 * The order resolves its link by product id, so `slug` is whatever that product
 * is called *now* wherever `linked` is true. Where it is false the slug is the
 * snapshot, kept as text: a line degrades to plain words rather than sending a
 * customer into a 404.
 */
export const orderLineSchema = z
  .object({
    name: z.string(),
    slug: z.string(),
    /** False once the product is unpublished or soft-deleted: nothing to open. */
    linked: z.boolean(),
    image: catalogImageSchema.nullable(),
    /** The lens the line was bought through, frozen with it. */
    unit: productUnitSchema,
    /**
     * `pieces` read through `unit`, to three decimals — a **display snapshot**,
     * so an order reads back as the quantity that was shown when it was placed
     * even after the product is repacked. `pieces` is what was ordered.
     */
    quantity: z.number().positive(),
    pieces: z.number().int().positive(),
    lineTotalMinor: z.number().int().nonnegative(),
    note: z.string().nullable(),
  })
  .strict();
export type OrderLine = z.infer<typeof orderLineSchema>;

/**
 * The same line as staff read it (FR-UNIT-04): in **basis units**, the way the
 * source system prices — "10 × 19.99" for one box of 100 pieces at a basis of
 * ten. The customer's view never carries the basis, and neither view ever
 * carries the product's private source id.
 */
export const adminOrderLineSchema = orderLineSchema.extend({
  priceMinor: z.number().int().nonnegative(),
  priceBasisPieces: z.number().int().positive(),
});
export type AdminOrderLine = z.infer<typeof adminOrderLineSchema>;

/** A row in the order list. */
export const orderSummarySchema = z
  .object({
    reference: z.string(),
    status: orderStatusSchema,
    createdAt: z.string().datetime(),
    totalMinor: z.number().int().nonnegative(),
    currency: z.string(),
    itemCount: z.number().int().nonnegative(),
  })
  .strict();
export type OrderSummary = z.infer<typeof orderSummarySchema>;

/**
 * The address as the order froze it. Not `addressSchema`: a snapshot has no id
 * and no timestamps, and saying so in the type keeps it from being edited by
 * mistake.
 */
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

/** The office an order is collected from, named as it read at the time —
 * config is editable, and an old order must stay readable. */
export const orderPickupSchema = z
  .object({
    key: z.string(),
    name: z.string(),
    address: z.string(),
  })
  .strict();
export type OrderPickup = z.infer<typeof orderPickupSchema>;

/**
 * The delivery zone resolved from the address (FR-CART-07), snapshotted with
 * its free-delivery threshold. Advisory: it never blocked the order and never
 * priced the delivery, which a manager does.
 */
export const orderDeliveryZoneSchema = z
  .object({
    key: z.string(),
    freeFromMinor: z.number().int().nonnegative().nullable(),
  })
  .strict();
export type OrderDeliveryZone = z.infer<typeof orderDeliveryZoneSchema>;

export const orderDetailSchema = orderSummarySchema.extend({
  contact: orderContactSchema,
  /** Who it was invoiced to, as it read when the order was placed — resolved
   * from the account where the customer named nobody else. */
  party: orderingPartySchema,
  fulfilmentMethod: fulfilmentMethodSchema,
  deliveryAddress: orderAddressSchema.nullable(),
  pickup: orderPickupSchema.nullable(),
  deliveryZone: orderDeliveryZoneSchema.nullable(),
  billingAddress: orderAddressSchema,
  paymentMethod: paymentMethodSchema,
  preferredDate: z.string().date().nullable(),
  customerNote: z.string().nullable(),
  lines: z.array(orderLineSchema),
  shipment: cartPreviewSchema.shape.shipment,
});
export type OrderDetail = z.infer<typeof orderDetailSchema>;

/**
 * The staff view. It adds what the customer must never see: which price list
 * the order was taken from, who placed it, and the lines in basis units.
 */
export const adminOrderDetailSchema = orderDetailSchema.extend({
  lines: z.array(adminOrderLineSchema),
  /** Null for a guest order — nothing to open, which is the point. */
  customerEmail: z.string().nullable(),
  /** Which list it was priced from; null means the default one. */
  tierKey: z.string().nullable(),
  statusChangedAt: z.string().datetime(),
});
export type AdminOrderDetail = z.infer<typeof adminOrderDetailSchema>;

export const ORDER_PAGE_SIZE = 20;
/** As long as the longest thing anybody pastes in: an email address. */
export const ORDER_QUERY_MAX_LENGTH = 200;

/**
 * A cart the server priced differently from what the browser last saw. The
 * fresh preview travels with the refusal so the customer sees the corrected
 * cart rather than being told to try again.
 */
export const cartChangedSchema = apiErrorSchema(['cart-changed']).extend({
  preview: cartPreviewSchema,
});

export const ordersContract = c.router({
  submitOrder: {
    method: 'POST',
    path: '/orders',
    body: orderSubmissionSchema,
    responses: {
      201: z
        .object({
          reference: z.string(),
          /** The guest's only record of the order (FR-NOTIF-06): the mailed
           * link opens the summary without signing in. */
          publicToken: z.string(),
        })
        .strict(),
      400: apiErrorSchema([
        'invalid-company-id',
        'unsupported-country',
        /** The postal code is not the shape its country's codes take. */
        'invalid-postal-code',
        'unknown-pickup-location',
        /** Bank transfer invoices a legal entity, so it is available only
         * where the party has a registration number. Re-checked here because
         * what the form offered is not what the server trusts. */
        'billing-details-required',
        /** An order with no account named no party. Only reachable by a guest,
         * whose form has nobody to resolve one from. */
        'party-required',
        /** A staff session tried to place one. Role is authorization, not a
         * pricing group: an admin or a manager has no tier, no address book
         * worth the name and nobody to invoice, and an order in their name
         * would land in the very inbox they answer. The storefront does not
         * offer them a checkout; this is what makes that a rule. */
        'staff-cannot-order',
        /** ADR 0015's honeypot caught it. Its own code rather than a borrowed
         * one: a bot never reads the answer, but a person tripped by an
         * autofill would, and being told a full cart is empty explains
         * nothing. */
        'rejected',
      ]),
      409: cartChangedSchema,
    },
    summary: 'Place an order request',
  },
  listMyOrders: {
    method: 'GET',
    path: '/account/orders',
    query: z.object({ page: z.coerce.number().int().positive().optional() }),
    responses: {
      200: z
        .object({
          items: z.array(orderSummarySchema),
          pagination: paginationSchema,
        })
        .strict(),
      401: commonAuthErrorSchema,
    },
    summary: "The signed-in account's order requests (FR-ACC-01)",
  },
  getMyOrder: {
    method: 'GET',
    path: '/account/orders/:reference',
    responses: {
      200: orderDetailSchema,
      401: commonAuthErrorSchema,
      /** Another account's order is a 404, never a 403: whether a reference
       * exists is not something a stranger gets to learn. */
      404: apiErrorSchema(['order-not-found']),
    },
    summary: 'One of the account’s own order requests',
  },
  getOrderByToken: {
    method: 'GET',
    path: '/orders/by-token/:token',
    responses: {
      200: orderDetailSchema,
      404: apiErrorSchema(['order-not-found']),
    },
    summary: 'A mailed order summary, readable without signing in',
  },
  listOrders: {
    method: 'GET',
    path: '/admin/orders',
    query: z.object({
      page: z.coerce.number().int().positive().optional(),
      status: orderStatusSchema.optional(),
      /**
       * Find-an-order, matched against the reference, who to ask for, the
       * party being invoiced and either email on the order — the handful of
       * things a manager has in front of them when the phone rings. A
       * fragment, not a whole value: a customer reads out the last digits of
       * a reference as readily as all of it.
       */
      q: z.string().trim().max(ORDER_QUERY_MAX_LENGTH).optional(),
    }),
    responses: {
      200: z
        .object({
          items: z.array(
            orderSummarySchema.extend({
              customerEmail: z.string().nullable(),
              contactName: z.string(),
            }),
          ),
          pagination: paginationSchema,
        })
        .strict(),
      401: commonAuthErrorSchema,
    },
    summary: 'All order requests, for staff (FR-AUTH-03)',
  },
  getOrder: {
    method: 'GET',
    path: '/admin/orders/:reference',
    responses: {
      200: adminOrderDetailSchema,
      401: commonAuthErrorSchema,
      404: apiErrorSchema(['order-not-found']),
    },
    summary: 'One order request, for staff',
  },
});
