import * as z from 'zod';
import type { DeepReadonly } from '../deep-readonly';
import { refuseCountForms } from '../fill-text';
import { mergeShapes } from '../merge-shapes';
import { ACCOUNTS_AREA } from '../../core/accounts/accounts-area';
import { sharedAccountsTextShape } from '../../core/accounts/accounts-text';
import { CATALOG_AREA } from '../../core/catalog/catalog-area';
import { sharedCatalogTextShape } from '../../core/catalog/catalog-text';
import { PAGE_SLUGS } from '../../core/site/pages';

/** An order status per reading: `ready` is on its way or waiting to be
 * collected. The customers' set; staff have theirs in the admin text. */
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
 * The shop's names and the wording customers read in more than one place: the
 * storefront, mail and order summary, with the admin borrowing the names. Sent
 * with every page, so nothing written only for staff belongs here.
 */
export const sharedTextShape = {
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
  /** Read out after the name of a group of choices that needs an answer:
   * the asterisk is drawn, not read, and a group cannot say it otherwise. */
  required: z.string(),
  /** Stands in for a missing picture, as its caption and accessible name. */
  imagePlaceholder: z.string(),
  /** The toggle under a list or a description that is cut short. */
  showMore: z.string(),
  showLess: z.string(),
  /** Under a list that runs to more than one page. `status` fills in
   * `{page}` and `{total}`. */
  pagination: z
    .object({ previous: z.string(), next: z.string(), status: z.string() })
    .strict(),
  /** `{qty} {unit}`: a quantity bought in pieces. */
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
      /** Under a listing, which may hold goods at different rates and so
       * names none. Nothing is said where no tax is charged. */
      listing: z.object({ included: z.string(), added: z.string() }).strict(),
      /** Beside a price only, where a deployment says more there than the
       * statement, such as that delivery comes on top; `{statement}`. Not
       * under a total, which a pickup order has no delivery on. */
      atPrice: z.string().optional(),
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
};

/** Every area's block, so a missing key or a stray one stops the boot. */
export const sharedTextSchema = z
  .object(
    mergeShapes(
      sharedTextShape,
      { [CATALOG_AREA]: z.object(sharedCatalogTextShape).strict() },
      { [ACCOUNTS_AREA]: z.object(sharedAccountsTextShape).strict() },
    ),
  )
  .strict()
  .superRefine(refuseCountForms);

/** The keys no area claims; an area reads its block through its own token. */
export type SharedText = DeepReadonly<
  z.infer<z.ZodObject<typeof sharedTextShape>>
>;
