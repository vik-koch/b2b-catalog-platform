import * as z from 'zod';
import type { DeepReadonly } from '../deep-readonly';
import { refuseCountForms } from '../fill-text';
import { mergeShapes } from '../merge-shapes';
import { ACCOUNTS_AREA } from '../../core/accounts/accounts-area';
import { sharedAccountsTextShape } from '../../core/accounts/accounts-text';
import { CATALOG_AREA } from '../../core/catalog/catalog-area';
import { ORDERING_AREA } from '../../core/ordering/ordering-area';
import { sharedOrderingTextShape } from '../../core/ordering/ordering-text';
import { sharedCatalogTextShape } from '../../core/catalog/catalog-text';
import { PAGE_SLUGS } from '../../core/site/pages';

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
      { [ORDERING_AREA]: z.object(sharedOrderingTextShape).strict() },
    ),
  )
  .strict()
  .superRefine(refuseCountForms);

/** The keys no area claims; an area reads its block through its own token. */
export type SharedText = DeepReadonly<
  z.infer<z.ZodObject<typeof sharedTextShape>>
>;
