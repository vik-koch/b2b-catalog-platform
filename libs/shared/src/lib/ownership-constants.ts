/**
 * Which areas of the platform's data an external system may own, and what it
 * owns while it does — a field list for some areas, the whole area for others.
 * Import-free, like the other `*-constants` modules, so an editor that greys a
 * field does not pull Zod in to do it.
 */

/**
 * The areas an operator can hand over. A closed set in code: an area is a rule
 * about who may write which rows and who may read which log, and a new one
 * arrives with the exchange that needs it rather than as deployment data.
 *
 * They are stored one by one and never summed into a fourth flag — "the whole
 * shop is owned" is a read over this list, and a stored answer to it could
 * disagree with the areas beneath it.
 */
export const OWNERSHIP_AREAS = ['catalog', 'customers', 'orders'] as const;
export type OwnershipArea = (typeof OWNERSHIP_AREAS)[number];

/**
 * The product fields an owning system writes, named as they appear in the
 * admin write contract so the guard can compare an input against what is
 * stored without a translation table in between.
 *
 * `sourceId` is here because it is the key the exchange matches on: an admin
 * retyping it does not edit a product, it hands the exchange a stranger and
 * orphans the row it meant to change.
 *
 * `lowStockThresholdPieces` is deliberately absent. It reads the stock figure
 * but does not carry it — it is the shop's own "few left" wording rule, and
 * the exchange has no opinion about it.
 */
export const OWNED_PRODUCT_FIELDS = [
  'name',
  'categoryId',
  'priceMinor',
  'tierPrices',
  'stockPieces',
  'sourceId',
] as const;
export type OwnedProductField = (typeof OWNED_PRODUCT_FIELDS)[number];

/**
 * The category fields an owning system writes. Far shorter than the product
 * list, and the asymmetry is the point: the exchange says which leaf a product
 * hangs on and what that leaf is called, while the shape of the tree above it
 * — parent, order, nickname, image, description — is presentation the shop has
 * always owned (the export carries no parent path at all).
 */
export const OWNED_CATEGORY_FIELDS = ['name', 'sourceId'] as const;
export type OwnedCategoryField = (typeof OWNED_CATEGORY_FIELDS)[number];

/**
 * The customer-tier field an owning system writes — the `key` a price column
 * addresses the list by (`price:<key>`), which is a sync key exactly as
 * `sourceId` is: retyping it does not rename a price list, it points the
 * exchange at a list nobody has.
 *
 * Everything else about a tier stays the shop's, and deliberately so. The
 * `label` and the display order are staff-facing wording the exchange never
 * carries — a run sends prices keyed by `key` and nothing more — so freezing
 * them would be freezing a field against no second writer. Creating a tier
 * stays open because it is how an admin answers the `unknown-price-list` row
 * error without handing the catalog back first; it writes no price, so there
 * is nothing for two writers to contend over. Deleting one stays open because
 * a tier holding prices or accounts is already refused, which leaves only a
 * list nothing uses.
 */
export const OWNED_TIER_FIELDS = ['key'] as const;
export type OwnedTierField = (typeof OWNED_TIER_FIELDS)[number];

/**
 * The customer area owns no field list, and that is the whole shape of it: an
 * owning system does everything a manager can do to a customer account, so
 * while the area is owned the platform's own side is closed as a whole rather
 * than column by column. A list here would need extending every time a manager
 * gained a button, and the one it forgot would be the one that mattered.
 *
 * What stays open is not a set of fields but a set of *actors*: the account
 * holder still edits their own name and phone and still closes their account
 * (FR-AUTH-06), and staff administration is untouched, because an admin who
 * could not appoint another admin would have handed away more than a customer
 * list. See `ownership.refusals.ts` for where the closure is enforced.
 */

/**
 * Order processing owns no field list either, and for a nearer reason than the
 * customer area's: an order is not a record staff edit but a thread of versions
 * they answer, and every button on it — the moves, the adjustment, the payment
 * tick, the file a manager supplies — writes the same order. A column list
 * could not describe half of that.
 *
 * Two acts stay open here that are nobody's staff work: placing an order and
 * calling off an unanswered one are the customer's own, exactly as editing
 * their own name is (FR-ADM-10). An owned area therefore still gains orders and
 * still loses them, which the exchange reads rather than resolves.
 */

/**
 * The refusals the switch produces, in pairs: one tells an admin the exchange
 * holds the pen, the other tells an automated client that it does not.
 *
 * A 409 rather than a 403: the caller is allowed to make this request, and
 * would be obeyed under a different setting. Nothing is being withheld from
 * them — the platform is in a state that conflicts with what they asked.
 *
 * Codes name the area rather than carrying it as data, because a code is the
 * whole contract of a refusal (`message` is never rendered) and one sentence
 * per code is what the panel's text file is keyed by — a string per area, never
 * a parameter.
 */
export const ownershipErrors = {
  'catalog-externally-owned': { status: 409 },
  'catalog-not-externally-owned': { status: 409 },
  'customers-externally-owned': { status: 409 },
  'customers-not-externally-owned': { status: 409 },
  'orders-externally-owned': { status: 409 },
  'orders-not-externally-owned': { status: 409 },
} as const;
export type OwnershipErrorCode = keyof typeof ownershipErrors;
