/**
 * Which owned fields a save would move (FR-ADM-10). A save sends the whole
 * entity, so the rule is about change, not presence: sending the stored value
 * back is no write. If the exchange moved a price since the editor loaded, the
 * save is refused rather than silently undoing the exchange.
 */

import { ProductTierPrice } from '@b2b-catalog-platform/shared/admin/catalog';

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
  'taxRate',
  'sourceId',
] as const;
export type OwnedProductField = (typeof OWNED_PRODUCT_FIELDS)[number];

/**
 * The category fields an owning system writes. Far shorter than the product
 * list, and the asymmetry is the point: the exchange says which leaf a product
 * hangs on and what that leaf is called, while the shape of the tree above it
 * — parent, order, nickname, mark — is presentation the shop has
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

/** What the comparison needs from the stored product; a subset of the row. */
export interface StoredOwnedProduct {
  name: string;
  categoryId: string;
  priceMinor: number | null;
  sourceId: string;
  stockPieces: number | null;
  taxRate: number | null;
  tierPrices: readonly ProductTierPrice[];
}

/** What it needs from the save; an omitted `sourceId` leaves it alone. */
export interface SubmittedOwnedProduct {
  name: string;
  categoryId: string;
  priceMinor: number | null;
  sourceId?: string;
  stockPieces: number | null;
  taxRate: number | null;
  tierPrices: readonly ProductTierPrice[];
}

export function changedProductFields(
  stored: StoredOwnedProduct,
  input: SubmittedOwnedProduct,
): OwnedProductField[] {
  const moved: Record<OwnedProductField, boolean> = {
    name: stored.name !== input.name,
    categoryId: stored.categoryId !== input.categoryId,
    priceMinor: stored.priceMinor !== input.priceMinor,
    stockPieces: stored.stockPieces !== input.stockPieces,
    taxRate: stored.taxRate !== input.taxRate,
    // Absent means "keep what is stored", which is never a change.
    sourceId:
      input.sourceId !== undefined && input.sourceId !== stored.sourceId,
    tierPrices: tierPricesDiffer(stored.tierPrices, input.tierPrices),
  };
  return OWNED_PRODUCT_FIELDS.filter((field) => moved[field]);
}

/** Order-insensitive: the overrides are a map keyed by tier, sent in no
 * promised order. */
function tierPricesDiffer(
  stored: readonly ProductTierPrice[],
  input: readonly ProductTierPrice[],
): boolean {
  if (stored.length !== input.length) return true;
  const before = new Map(stored.map((p) => [p.tierId, p.priceMinor]));
  return input.some((p) => before.get(p.tierId) !== p.priceMinor);
}

export interface StoredOwnedCategory {
  name: string;
  sourceId: string | null;
}

export interface SubmittedOwnedCategory {
  name: string;
  sourceId?: string | null;
}

/**
 * A keyless category is nobody else's: no run renames or deletes it. Its key
 * stays open too, since typing one in is how a hand-made category binds to the
 * source tree.
 */
export function changedCategoryFields(
  stored: StoredOwnedCategory,
  input: SubmittedOwnedCategory,
): OwnedCategoryField[] {
  if (stored.sourceId === null) return [];
  const moved: Record<OwnedCategoryField, boolean> = {
    name: stored.name !== input.name,
    sourceId:
      input.sourceId !== undefined && input.sourceId !== stored.sourceId,
  };
  return OWNED_CATEGORY_FIELDS.filter((field) => moved[field]);
}
