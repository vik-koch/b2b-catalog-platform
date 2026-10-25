import { oc } from '@orpc/contract';
import * as z from 'zod';
import {
  FULFILMENT_METHODS,
  MY_ORDER_FILTERS,
  ORDER_NOTE_MAX,
  ORDER_STATUS_REASON_MAX,
  ORDER_STATUSES,
  PARTY_NAME_MAX,
  PAYMENT_METHODS,
  PAYMENT_STATES,
  PICKUP_LOCATION_KEY_MAX,
} from './order-constants';
import { ORDER_DOCUMENT_KINDS } from './order-document-constants';
import { TAX_BASES } from '../core/tax';
import {
  addressInputSchema,
  countryCodeSchema,
} from '../accounts/address.contract';
import {
  companyRegistrationIdSchema,
  lowercaseEmailField,
} from '../config/contact-config';
import { commonAuthErrors } from '../core/api-error';
import {
  cartLineSchema,
  cartPreviewSchema,
  productUnitSchema,
} from './cart.contract';
import { CART_LINES_MAX } from './cart-constants';
import {
  catalogImageSchema,
  paginationSchema,
} from '../catalog/catalog.contract';

/**
 * Placing an order request and reading it back (FR-CART-03/04/07, FR-ACC-01,
 * FR-NOTIF-06). An order is a **request**: it is priced, recorded and mailed,
 * and a manager confirms it. Nothing here charges anybody.
 */

export const orderStatusSchema = z.enum(ORDER_STATUSES);
export type OrderStatus = z.infer<typeof orderStatusSchema>;

export const fulfilmentMethodSchema = z.enum(FULFILMENT_METHODS);
export type FulfilmentMethod = z.infer<typeof fulfilmentMethodSchema>;

export const paymentMethodSchema = z.enum(PAYMENT_METHODS);
export type PaymentMethod = z.infer<typeof paymentMethodSchema>;

/** Whether the money has arrived (FR-ORD-04), read apart from the status. */
export const paymentStateSchema = z.enum(PAYMENT_STATES);
export type PaymentState = z.infer<typeof paymentStateSchema>;

/** How a customer narrows their own history — the two queues their panel
 * counts (FR-WORK-03). */
export const myOrderFilterSchema = z.enum(MY_ORDER_FILTERS);
export type MyOrderFilter = z.infer<typeof myOrderFilterSchema>;

/**
 * Where an order goes, and where its invoice goes. The same shape as a saved
 * address, because that is what it usually is — a row picked out of the book,
 * or typed once by a guest who has no book.
 */
export const orderAddressInputSchema = addressInputSchema;
export type OrderAddressInput = z.infer<typeof orderAddressInputSchema>;

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
    email: lowercaseEmailField(255),
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
    /**
     * Where the invoice goes, or null where the deployment invoices no address
     * of its own (`billingAddressEnabled`). Null then means there is none —
     * not that it is the delivery one, which the order would have said by
     * carrying it. The server holds the submission to the deployment's answer
     * either way.
     */
    billingAddress: orderAddressInputSchema.nullable(),
    paymentMethod: paymentMethodSchema,
    /**
     * The day the customer would like it, ISO `YYYY-MM-DD`. A wish, not a
     * booking: scheduling is settled between customer and manager (FR-CART-07),
     * and nothing here reserves a slot. A date rather than free text because it
     * is one — a manager sorting by it, or a later screen showing this week's
     * requests, cannot do either with a sentence.
     */
    preferredDate: z.iso.date().nullable(),
    customerNote: z.string().trim().min(1).max(ORDER_NOTE_MAX).nullable(),
    expectedTotalMinor: z.number().int().nonnegative(),
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
    /** The rate the line was taxed at when its version was written
     * (NFR-LEGAL-11); null under a basis that charges no tax. */
    taxRate: z.number().nullable(),
    note: z.string().nullable(),
  })
  .strict();
export type OrderLine = z.infer<typeof orderLineSchema>;

/** A row in the order list. */
export const orderSummarySchema = z
  .object({
    reference: z.string(),
    status: orderStatusSchema,
    /** The second axis (FR-ORD-04). In the list because "accepted, still
     * unpaid" is one row a manager scans for, and because a customer's own
     * list is where they find out something is owed. */
    paymentState: paymentStateSchema,
    /** How it reaches the customer. In the summary because the status is read
     * through it: a `ready` order is waiting on a shelf or on its way, and a
     * row that cannot say which cannot word its own badge. */
    fulfilmentMethod: fulfilmentMethodSchema,
    createdAt: z.iso.datetime(),
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

export const orderDocumentKindSchema = z.enum(ORDER_DOCUMENT_KINDS);

/**
 * A document the reader can open on this order (FR-ORD-05, ADR 0052).
 *
 * The list is what *exists*, not what could: a generated summary is always
 * there, and a payment instruction is there once somebody has supplied one.
 * The bytes are fetched separately, from the order-documents path — nothing
 * here is a URL, because the address is the order plus the kind and the reader
 * is who they are.
 */
export const orderDocumentSchema = z
  .object({
    kind: orderDocumentKindSchema,
    /** Whether the platform draws this one or somebody handed it over. A
     * supplied file replaces the generated one entirely. */
    source: z.enum(['generated', 'supplied']),
    /** What it downloads as — the uploaded name for a supplied file, and the
     * order's reference for a generated one. */
    fileName: z.string(),
    contentType: z.string(),
    /** Null for a generated document: nothing is stored, so nothing has a
     * size until it is drawn. */
    byteSize: z.number().int().positive().nullable(),
    suppliedAt: z.iso.datetime().nullable(),
  })
  .strict();
export type OrderDocument = z.infer<typeof orderDocumentSchema>;

export const orderDetailSchema = orderSummarySchema.extend({
  contact: orderContactSchema,
  /** Who it was invoiced to, as it read when the order was placed — resolved
   * from the account where the customer named nobody else. */
  party: orderingPartySchema,
  deliveryAddress: orderAddressSchema.nullable(),
  pickup: orderPickupSchema.nullable(),
  deliveryZone: orderDeliveryZoneSchema.nullable(),
  /** Null where the deployment invoices no address of its own, and on orders
   * placed before it stopped asking for one. */
  billingAddress: orderAddressSchema.nullable(),
  paymentMethod: paymentMethodSchema,
  preferredDate: z.iso.date().nullable(),
  customerNote: z.string().nullable(),
  /** Why it was declined or called off (FR-ORD-02), null on every other
   * status. The customer is told it, so it is on their view and not only in
   * the mail they were sent. */
  statusReason: z.string().nullable(),
  /** When the terms the order accepted were last changed (NFR-LEGAL-10):
   * how a reader tells one version from another. Null where it accepted none. */
  termsDate: z.iso.datetime().nullable(),
  /** The tax basis the order was submitted under (NFR-LEGAL-11) — stated
   * under its total in place of the deployment's current one. */
  taxBasis: z.enum(TAX_BASES),
  /**
   * What the shop said about every change it has made to this order
   * (FR-ORD-03), oldest first, up to and including the version being shown.
   * Empty on an order nobody has changed.
   *
   * The whole list rather than the last one: the mail quotes what changed
   * since the customer was last written to, and a page that showed only the
   * newest note would describe the same version differently from the message
   * that announced it — including showing nothing at all, where the version
   * being shown is a move rather than a change.
   */
  changes: z.array(z.string()),
  lines: z.array(orderLineSchema),
  shipment: cartPreviewSchema.shape.shipment,
  /** What can be opened on this order (FR-ORD-05). A customer's list carries
   * the summary as they are entitled to read it, and a payment instruction
   * only once the shop has supplied one. */
  documents: z.array(orderDocumentSchema),
});
export type OrderDetail = z.infer<typeof orderDetailSchema>;

/**
 * A cart the server priced differently from what the browser last saw. The
 * fresh preview travels with the refusal so the customer sees the corrected
 * cart rather than being told to try again.
 */
/**
 * The refusal that carries an answer with it: the cart was priced differently
 * from what the browser held, and the fresh pricing rides along so the page can
 * show what changed instead of asking again.
 */
export const cartChangedDataSchema = z.object({ preview: cartPreviewSchema });

/**
 * The refusal a deployment that enforces pairings gives (FR-SET-04): which
 * products are short, and by how many pieces. Named rather than folded into
 * `cart-changed`, because nothing about the cart changed — it is exactly the
 * cart the customer was shown, and a "what moved while you were away" banner
 * about something that did not move explains the wrong thing.
 */
export const pairingUnsatisfiedDataSchema = z.object({
  shortfalls: z.array(
    z.object({
      slug: z.string(),
      shortPieces: z.number().int().positive(),
    }),
  ),
});

/**
 * The refusals about the *order itself* — its party, its addresses, where it
 * goes and how it is paid. Shared by the checkout and by an adjustment, which
 * has to hold a manager to the same rules: an order a customer could not have
 * placed is not one staff may write on their behalf either.
 */
export const orderDetailErrors = {
  'invalid-company-id': { status: 400 },
  'unsupported-country': { status: 400 },
  /** The postal code is not the shape its country's codes take. */
  'invalid-postal-code': { status: 400 },
  'unknown-pickup-location': { status: 400 },
  /** Bank transfer invoices a legal entity, so it is available only where the
   * party has a registration number. Re-checked here because what the form
   * offered is not what the server trusts. */
  'billing-details-required': { status: 400 },
  /** Neither cash nor a card arranged offline is offered for an order
   * invoiced to a company: a company is invoiced (FR-CART-04). No form offers
   * them either; this is what makes it a rule. */
  'cash-not-available': { status: 400 },
  /** The deployment invoices an address of its own and the submission carried
   * none. Only reachable by a browser out of step with the config the form was
   * drawn from. */
  'billing-address-required': { status: 400 },
  /** The party is a kind of customer the shop does not sell to (FR-AUTH-13):
   * a person where it sells to companies only, or the other way round. No
   * form offers one; this is what makes it a rule. */
  'customer-type-not-accepted': { status: 400 },
} as const;

/** Every refusal the checkout can be given. All 400s but one. */
const submissionErrors = {
  ...orderDetailErrors,
  /** An order with no account named no party. Only reachable by a guest, whose
   * form has nobody to resolve one from. */
  'party-required': { status: 400 },
  /** A staff session tried to place one. Role is authorization, not a pricing
   * group: an admin or a manager has no tier, no address book worth the name
   * and nobody to invoice, and an order in their name would land in the very
   * inbox they answer. The storefront does not offer them a checkout; this is
   * what makes that a rule. */
  'staff-cannot-order': { status: 400 },
  /** ADR 0015's honeypot caught it. Its own code rather than a borrowed one: a
   * bot never reads the answer, but a person tripped by an autofill would, and
   * being told a full cart is empty explains nothing. */
  rejected: { status: 400 },
  /** The cart is missing what its products are sold with, and this deployment
   * refuses on that (FR-SET-04). Advisory everywhere else, where the cart says
   * it and the customer decides. */
  'pairing-unsatisfied': { status: 400, data: pairingUnsatisfiedDataSchema },
  'cart-changed': { status: 409, data: cartChangedDataSchema },
} as const;

/** Reading an order the caller may not have is the same answer as it not
 * existing: whether a reference exists is not something a stranger gets to
 * learn. */
export const orderNotFound = { 'order-not-found': { status: 404 } } as const;

/**
 * Everything a transition can be refused for (FR-ORD-02).
 *
 * `transition-not-allowed` covers both halves of the table at once — the move
 * this actor may never make, and the move nobody can make from where the order
 * now stands. They are one answer on purpose: an order that moved while the
 * screen was open should be reloaded, and telling a caller *which* of the two
 * it was tells a customer about states they cannot see.
 */
/**
 * The order's personal details were removed (NFR-LEGAL-14), so it is finished
 * for good: nothing moves it, changes it or writes to its customer again.
 */
export const detailsRemoved = {
  'personal-data-removed': { status: 409 },
} as const;

export const transitionErrors = {
  ...orderNotFound,
  ...detailsRemoved,
  'transition-not-allowed': { status: 409 },
  /** Declining or cancelling says why; the customer's mail quotes it. */
  'reason-required': { status: 400 },
} as const;

/**
 * A customer calling their own order off: the same move, with only the one
 * thing they get to say about it — and they need not say it. The shop's own
 * refusals are quoted at a customer and must explain themselves; a customer
 * owes the shop no justification for changing their mind.
 */
export const orderCancellationSchema = z
  .object({
    reason: z.string().trim().min(1).max(ORDER_STATUS_REASON_MAX).nullable(),
  })
  .strict();
export type OrderCancellation = z.infer<typeof orderCancellationSchema>;

/** The signed-in account's own orders, and staff's view of all of them. */
export const authed = oc.errors(commonAuthErrors);

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
          /** The guest's only record of the order (FR-NOTIF-06): the mailed
           * link opens the summary without signing in. */
          publicToken: z.string(),
        })
        .strict(),
    ),

  listMyOrders: authed
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
          /**
           * Narrowed to one of the things waiting on them, which is what the
           * marker on their account control links to. Absent is the whole
           * history; a value the URL invented is refused here rather than
           * quietly ignored, since nothing but the two links produces one.
           */
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

  getMyOrder: authed
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
   * The customer calling their own order off (FR-ORD-02). Its own route rather
   * than the staff one with a wider guard: this caller may make exactly one
   * move, on exactly their own orders, and a body that cannot name another
   * target is the plainest way to say so.
   *
   * Deliberately absent from the token view. A mailed link is a read
   * capability, and a forwarded mail must not be able to stop an order.
   */
  cancelMyOrder: authed
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
        body: orderCancellationSchema,
      }),
    )
    .output(orderDetailSchema),
};
