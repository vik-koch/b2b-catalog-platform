import { oc } from '@orpc/contract';
import * as z from 'zod';
import {
  FULFILMENT_METHODS,
  ORDER_ADJUSTMENT_NOTE_MAX,
  ORDER_NOTE_MAX,
  ORDER_QUERY_MAX_LENGTH,
  ORDER_NOTICES,
  ORDER_REVISION_KINDS,
  ORDER_STATUS_REASON_MAX,
  ORDER_STATUSES,
  PARTY_NAME_MAX,
  PAYMENT_METHODS,
  PAYMENT_STATES,
  PICKUP_LOCATION_KEY_MAX,
  STAFF_ORDER_SORTS,
  STAFF_PAYMENT_FILTERS,
} from './order-constants';
import { addressInputSchema, countryCodeSchema } from './address.contract';
import {
  companyRegistrationIdSchema,
  lowercaseEmailField,
} from './contact-config';
import { commonAuthErrors } from './api-error';
import {
  cartLineSchema,
  cartPreviewSchema,
  productUnitSchema,
} from './cart.contract';
import { CART_LINES_MAX, CART_NOTE_MAX } from './cart-constants';
import { LINE_PIECES_MAX } from './product-units';
import { catalogImageSchema, paginationSchema } from './catalog.contract';

/**
 * Placing an order request and reading it back (FR-CART-03/04/07, FR-ACC-01,
 * FR-NOTIF-06). An order is a **request**: it is priced, recorded and mailed,
 * and a manager confirms it. Nothing here charges anybody.
 */

export const orderStatusSchema = z.enum(ORDER_STATUSES);
export type OrderStatus = z.infer<typeof orderStatusSchema>;

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

export const fulfilmentMethodSchema = z.enum(FULFILMENT_METHODS);
export type FulfilmentMethod = z.infer<typeof fulfilmentMethodSchema>;

export const paymentMethodSchema = z.enum(PAYMENT_METHODS);
export type PaymentMethod = z.infer<typeof paymentMethodSchema>;

/** Whether the money has arrived (FR-ORD-04), read apart from the status. */
export const paymentStateSchema = z.enum(PAYMENT_STATES);
export type PaymentState = z.infer<typeof paymentStateSchema>;

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
   * Whether the customer's page is showing them something no message ever
   * announced — the one case where writing to them is a decision somebody
   * still has to take, and so the only case where the screen offers the
   * button.
   *
   * True two ways: their page is showing them a version no message announced,
   * or a change is sitting above the version they hold with nothing having
   * mentioned it yet. Not true of a move deliberately kept off their page —
   * that is a step the shop took back or never meant them to see, and an order
   * worked on behind the scenes would otherwise sit flagged for ever.
   */
  customerBehind: z.boolean(),
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
 * about the order today, whichever version is being looked at.
 */
export const orderRevisionSchema = adminOrderDetailSchema.extend({
  /** When this version was written, and by whom — null for the one the
   * customer submitted, and for anything an outside system writes back. */
  revisionCreatedAt: z.iso.datetime(),
  author: z.string().nullable(),
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
const orderDetailErrors = {
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
const orderNotFound = { 'order-not-found': { status: 404 } } as const;

/**
 * Everything a transition can be refused for (FR-ORD-02).
 *
 * `transition-not-allowed` covers both halves of the table at once — the move
 * this actor may never make, and the move nobody can make from where the order
 * now stands. They are one answer on purpose: an order that moved while the
 * screen was open should be reloaded, and telling a caller *which* of the two
 * it was tells a customer about states they cannot see.
 */
const transitionErrors = {
  ...orderNotFound,
  'transition-not-allowed': { status: 409 },
  /** Declining or cancelling says why; the customer's mail quotes it. */
  'reason-required': { status: 400 },
} as const;

/**
 * A line as a manager adjusts it (FR-ORD-03).
 *
 * Counted in **basis units** — "10 × 19.99" — because that is how staff read a
 * line, how the source system prices one, and the one way of counting that
 * cannot produce a quantity the price does not divide. The pieces follow from
 * it.
 *
 * The price travels as the pair it means nothing without. Both null asks the
 * server to price the line from the order's list at today's catalog price,
 * which is what a newly added line needs; both set is the price this line is
 * to keep, whether that is the one it was quoted at or the one agreed on the
 * phone. One of the two alone is neither.
 */
export const orderAdjustmentLineSchema = z
  .object({
    slug: z.string().trim().min(1).max(255),
    /** How many basis units of it. */
    units: z.number().int().positive().max(LINE_PIECES_MAX),
    /** The lens the customer reads it through, carried with the line. Null on
     * a line staff added, which nobody has read in any other unit yet. */
    unit: productUnitSchema.nullable(),
    /** The customer's words about this line, carried unedited. */
    note: z.string().trim().min(1).max(CART_NOTE_MAX).nullable(),
    priceMinor: z.number().int().nonnegative().nullable(),
    priceBasisPieces: z.number().int().positive().nullable(),
  })
  .strict()
  .refine(
    (line) => (line.priceMinor === null) === (line.priceBasisPieces === null),
    { message: 'a price and the basis it is per travel together' },
  );
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
 * The piece rules are not among them: a quantity is given in basis units and
 * is a whole number of them by construction, and the minimum a *customer* may
 * buy is not a rule about what a manager may write down.
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
        units: z.number().int().positive(),
        flags: z.array(adjustmentLineFlagSchema),
        /**
         * What the chosen price list charges for this product today, and what
         * that price is per — beside what the line actually costs.
         *
         * It is what lets a screen say that a line is priced away from the
         * list without pricing anything itself: the comparison is between two
         * figures the server worked out, and a manager is told that the
         * difference is deliberate rather than left to spot it.
         */
        listPriceMinor: z.number().int().nonnegative(),
        listPriceBasisPieces: z.number().int().positive(),
      }),
    ),
    totalMinor: z.number().int().nonnegative(),
    currency: z.string(),
    /** Re-resolved from the address as it now reads (FR-CART-07). */
    deliveryZone: orderDeliveryZoneSchema.nullable(),
    shipment: cartPreviewSchema.shape.shipment,
  })
  .strict();
export type OrderAdjustmentPreview = z.infer<
  typeof orderAdjustmentPreviewSchema
>;

/** Everything an adjustment can be refused for (FR-ORD-03). */
const adjustmentErrors = {
  ...orderNotFound,
  ...orderDetailErrors,
  /** Somebody else adjusted it while this one was being written. */
  'order-changed': { status: 409 },
  /** A slug no product answers to. Staff may add anything the catalog holds,
   * published or not — this is a request built against a different catalog. */
  'unknown-product': { status: 400 },
  /** A price list this deployment does not have. */
  'unknown-tier': { status: 400 },
  /** A line with no price of its own that the chosen list cannot price
   * exactly — a repackaged product whose basis no longer divides the
   * quantity. It is named rather than silently zeroed. */
  'line-not-priceable': { status: 400 },
  /** An adjustment that changes nothing the order says. A version identical to
   * the one before it is not history, it is noise in it — and a note is an
   * account of a change rather than a change of its own. Refused here rather
   * than in the screen, so a system writing adjustments back cannot fill the
   * thread with re-sends of a state the order already holds. */
  'no-change': { status: 409 },
} as const;

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

/** The signed-in account's own orders, and staff's view of all of them. */
const authed = oc.errors(commonAuthErrors);

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
    .errors(transitionErrors)
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
    .output(z.object({ revisions: z.array(orderRevisionSchema) }).strict()),

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
    .errors(adjustmentErrors)
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
    .errors(adjustmentErrors)
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
      summary: "Bring the customer's view up to date and mail them",
    })
    .errors({
      ...orderNotFound,
      /** The customer is already looking at the current version. */
      'nothing-to-tell': { status: 409 },
    })
    .input(z.object({ params: z.object({ reference: z.string() }) }))
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
