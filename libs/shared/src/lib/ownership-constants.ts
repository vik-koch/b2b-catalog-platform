/**
 * Which areas of the platform's data an external system may own, and which
 * fields it owns while it does. Import-free, like the other `*-constants`
 * modules, so an editor that greys a field does not pull Zod in to do it.
 */

/**
 * The areas an operator can hand over, one at a time. A closed set in code:
 * an area is a rule about who may write a column, and a new one arrives with
 * the exchange that needs it rather than as deployment data.
 */
export const OWNERSHIP_AREAS = ['catalog'] as const;
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
 * The two refusals the switch produces, and they are opposite news to opposite
 * readers: the first tells an admin the exchange holds the pen, the second
 * tells an automated client that it does not.
 *
 * A 409 rather than a 403: the caller is allowed to make this request, and
 * would be obeyed under a different setting. Nothing is being withheld from
 * them — the platform is in a state that conflicts with what they asked.
 *
 * Codes name the area rather than carrying it as data, because a code is the
 * whole contract of a refusal (`message` is never rendered) and one sentence
 * per code is what the panel's text file is keyed by. Iteration 13 adds two
 * more strings here, not a parameter.
 */
export const ownershipErrors = {
  'catalog-externally-owned': { status: 409 },
  'catalog-not-externally-owned': { status: 409 },
} as const;
export type OwnershipErrorCode = keyof typeof ownershipErrors;
