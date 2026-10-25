import * as z from 'zod';
import type { DeepReadonly } from '../core/deep-readonly';
import { refuseCountForms } from '../core/fill-text';
import { PAGE_SLUGS } from '../site/page-constants';

/** An order status per reading — `ready` reads by fulfilment: on its way, or
 * waiting to be collected. Customers' set here, staff's in the admin text. */
export const orderStatusLabels = z
  .object({
    requested: z.string(),
    approved: z.string(),
    readyDelivery: z.string(),
    readyPickup: z.string(),
    completed: z.string(),
    declined: z.string(),
    cancelled: z.string(),
  })
  .strict();

export const paymentMethodLabels = z
  .object({ cash: z.string(), transfer: z.string(), card: z.string() })
  .strict();

export const paymentStateLabels = z
  .object({ notDue: z.string(), awaiting: z.string(), paid: z.string() })
  .strict();

/** The routes the code names a page by, beside the page slugs. */
const NAV_ROUTES = [
  ...PAGE_SLUGS,
  'home',
  'catalog',
  'inquiry',
  'licenses',
  'more',
] as const;
const navNames = Object.fromEntries(
  NAV_ROUTES.map((route) => [route, z.string()]),
) as Record<(typeof NAV_ROUTES)[number], z.ZodString>;

const field = <T extends z.ZodRawShape>(checks: T) =>
  z.object({ label: z.string(), ...checks }).strict();

/**
 * The shop's shared names, and the wording its customers read in more than one
 * place — the storefront, mail and the order summary read it from here, and the
 * admin borrows the names. Public: the browser receives it on every page, so
 * nothing written only for staff belongs here; that wording is in the admin
 * text, and in the mail text where staff mail needs it.
 */
export const sharedTextSchema = z
  .object({
    /**
     * Names of the shop's pages and routes, keyed by route segment. Every page
     * slug and the routes the code names are required, since a page or a mail
     * may name any of them; any other segment a deployment links may be added.
     */
    nav: z.object(navNames).catchall(z.string()),
    /**
     * Controls that say the same on every screen, for customers and staff:
     * a dialog's way out, a row's remove button, a button's progress word. A
     * control that names what it does ("Delete selection") keeps its own key
     * with its screen; staff-only verbs are in the admin text's `actions`.
     */
    actions: z
      .object({
        cancel: z.string(),
        close: z.string(),
        done: z.string(),
        saving: z.string(),
        sending: z.string(),
        remove: z.string(),
        deleting: z.string(),
      })
      .strict(),
    /** Beside a field that may be left empty. */
    optional: z.string(),
    /** Under a list that runs to more than one page. `status` fills in
     * `{page}` and `{total}`. */
    pagination: z
      .object({ previous: z.string(), next: z.string(), status: z.string() })
      .strict(),
    /** Short unit names, as a quantity is stated beside goods. */
    units: z
      .object({ piece: z.string(), pack: z.string(), box: z.string() })
      .strict(),
    /** `{qty} {unit}` — a quantity bought in pieces. */
    quantity: z.string(),
    /** A quantity bought in packs or boxes, with what it came to in pieces. */
    quantityPieces: z.string(),
    /**
     * The tax basis under an order's total. `{rate}` is the rate every line
     * shares; the `mixed` forms stand where the lines differ, and each line
     * then states its own as `line`.
     */
    tax: z
      .object({
        included: z.string(),
        added: z.string(),
        none: z.string(),
        mixed: z.object({ included: z.string(), added: z.string() }).strict(),
        line: z.string(),
      })
      .strict(),
    /** A product's packing, as the product page states it and the editor
     * asks for it. */
    packaging: z
      .object({
        heading: z.string(),
        packContains: z.string(),
        boxContains: z.string(),
        boxVolume: z.string(),
        boxWeight: z.string(),
      })
      .strict(),
    /** What a product's parts are called, on its page and in its editor. */
    product: z
      .object({
        description: z.string(),
        documents: z.string(),
        variants: z.string(),
        /** The products sold together with this one. */
        pairings: z.string(),
        availability: z
          .object({ in: z.string(), low: z.string(), out: z.string() })
          .strict(),
      })
      .strict(),
    /** A document's size: `{size}` in kilobytes, or megabytes from one up. */
    fileSize: z.object({ kb: z.string(), mb: z.string() }).strict(),
    /**
     * What an order and its parts are called. The names read the same to
     * staff; the sets below them are the customer's, and staff have their own.
     */
    order: z
      .object({
        reference: z.string(),
        status: z.string(),
        total: z.string(),
        reason: z.string(),
        changeNote: z.string(),
        contact: z.string(),
        invoicedTo: z.string(),
        payment: z.string(),
        deliveryAddress: z.string(),
        preferredDelivery: z.string(),
        preferredPickup: z.string(),
        /** The heading over an order's lines. */
        items: z.string(),
        /** The customer's own note on the order. */
        note: z.string(),
        /** Where a collected order is picked up. */
        pickupPoint: z.string(),
        /** `{date}` the accepted terms were last changed. */
        termsVersion: z.string(),
        statuses: orderStatusLabels,
        paymentMethods: paymentMethodLabels,
        paymentStates: paymentStateLabels,
      })
      .strict(),
    /** How an order reaches the customer. */
    fulfilment: z
      .object({ label: z.string(), delivery: z.string(), pickup: z.string() })
      .strict(),
    /** Whether a customer or an order's party is a private person or a
     * company. */
    partyKind: z.object({ person: z.string(), company: z.string() }).strict(),
    /** A person's or company's details: the labels, which staff read too, and
     * the checks as a customer is told about their own. `companyId.format`
     * carries `{examples}`. */
    fields: z
      .object({
        name: field({ required: z.string() }),
        firstName: field({ required: z.string() }),
        lastName: field({ required: z.string() }),
        email: field({ required: z.string(), invalid: z.string() }),
        phone: field({ required: z.string(), incomplete: z.string() }),
        companyName: field({ required: z.string() }),
        companyId: field({ required: z.string(), format: z.string() }),
      })
      .strict(),
  })
  .strict()
  .superRefine(refuseCountForms);

export type SharedText = DeepReadonly<z.infer<typeof sharedTextSchema>>;
