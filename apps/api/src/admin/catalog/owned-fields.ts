/**
 * Which owned fields a save would move (FR-ADM-10). A save sends the whole
 * entity, so the rule is about change, not presence: sending the stored value
 * back is no write. If the exchange moved a price since the editor loaded, the
 * save is refused rather than silently undoing the exchange.
 */

import { ProductTierPrice } from '@b2b-catalog-platform/shared/admin/catalog';
import {
  OWNED_CATEGORY_FIELDS,
  OWNED_PRODUCT_FIELDS,
  OwnedCategoryField,
  OwnedProductField,
} from '@b2b-catalog-platform/shared/sync';

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
