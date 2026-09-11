import {
  OWNED_CATEGORY_FIELDS,
  OWNED_PRODUCT_FIELDS,
  OwnedCategoryField,
  OwnedProductField,
  ProductTierPrice,
} from '@b2b-catalog-platform/shared';

/**
 * Which owned fields a save would move (FR-ADM-10).
 *
 * The admin write contract takes a whole entity in one body, so "this field is
 * read-only" has no expression at the schema level: the editor sends `name` on
 * every save whether or not anybody typed in it. The rule is therefore about
 * *change* rather than about presence — a save that carries the stored value
 * back is not a write to that field, and a save that carries a different one
 * is, however it was produced.
 *
 * The consequence is deliberate: if the exchange moves a price between the
 * moment the editor loaded and the moment it saves, an admin who changed only
 * the description is refused and has to reload. That is the correct half of the
 * trade — the alternative is accepting their stale copy and silently undoing
 * the exchange, which is exactly the two-writers problem the switch exists to
 * remove.
 */

/** What the comparison needs from the stored product; a subset of the row. */
export interface StoredOwnedProduct {
  name: string;
  categoryId: string;
  priceMinor: number;
  sourceId: string;
  stockPieces: number | null;
  tierPrices: readonly ProductTierPrice[];
}

/** What it needs from the save. `sourceId` is optional in the contract — the
 * server mints one — and an omitted override is a save that leaves it alone. */
export interface SubmittedOwnedProduct {
  name: string;
  categoryId: string;
  priceMinor: number;
  sourceId?: string;
  stockPieces: number | null;
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
    // Absent means "keep what is stored", which is never a change.
    sourceId:
      input.sourceId !== undefined && input.sourceId !== stored.sourceId,
    tierPrices: tierPricesDiffer(stored.tierPrices, input.tierPrices),
  };
  return OWNED_PRODUCT_FIELDS.filter((field) => moved[field]);
}

/**
 * Order-insensitive: the overrides are a map keyed by tier, and the editor
 * makes no promise about the order it sends them in. A repeated tier cannot
 * reach here — the contract refuses it — so building a map loses nothing.
 */
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
  sourceId: string;
}

export interface SubmittedOwnedCategory {
  name: string;
  sourceId?: string;
}

export function changedCategoryFields(
  stored: StoredOwnedCategory,
  input: SubmittedOwnedCategory,
): OwnedCategoryField[] {
  const moved: Record<OwnedCategoryField, boolean> = {
    name: stored.name !== input.name,
    sourceId:
      input.sourceId !== undefined && input.sourceId !== stored.sourceId,
  };
  return OWNED_CATEGORY_FIELDS.filter((field) => moved[field]);
}
