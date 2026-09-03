import { piecesPerUnit } from './product-units';

/**
 * What a stock figure means to a customer (FR-STOCK-02). The count itself is
 * staff-facing and never leaves the API; this is the whole of what the
 * storefront learns about it.
 *
 * Import-free apart from the packaging arithmetic, so a listing component can
 * label a badge without pulling Zod into the first load.
 */
export const PRODUCT_AVAILABILITIES = ['out', 'low', 'in'] as const;
export type ProductAvailability = (typeof PRODUCT_AVAILABILITIES)[number];

/**
 * The "few left" line for a product sold loose, where no deployment has said
 * otherwise. One definition, because the API decides the state and the admin
 * form explains it, and a disagreement between the two would only show up as a
 * badge that did not match its own hint.
 */
export const DEFAULT_LOW_STOCK_THRESHOLD_PIECES = 10;

/** Just the packaging the threshold reads — a box, or a pack, or neither. */
interface AvailabilityPackaging {
  piecesPerPack: number | null;
  packsPerBox: number | null;
}

/**
 * Where "few left" sits: the pieces in one box, falling back to one pack, and
 * to the deployment's own figure where the product has neither. A product may
 * override it outright.
 *
 * The box is the unit the shop restocks in, which is why it and not the pack
 * is the first answer — a product with one box left is one order from empty
 * whatever the box holds.
 */
export function lowStockThreshold(
  packaging: AvailabilityPackaging,
  override: number | null,
  fallback: number,
): number {
  if (override !== null) return override;
  return (
    piecesPerUnit({ ...packaging, minPieceQty: 1 }, 'box') ??
    packaging.piecesPerPack ??
    fallback
  );
}

/**
 * The state a stock figure resolves to, or null where the deployment does not
 * track this product's stock at all — which is the default, and shows no badge
 * and restricts nothing.
 *
 * A negative figure is a stocktake correction, not an error: it reads as out of
 * stock, so the catalog is right again without a cleanup pass.
 */
export function productAvailability(
  stockPieces: number | null,
  packaging: AvailabilityPackaging,
  override: number | null,
  fallback: number,
): ProductAvailability | null {
  if (stockPieces === null) return null;
  if (stockPieces <= 0) return 'out';
  return stockPieces <= lowStockThreshold(packaging, override, fallback)
    ? 'low'
    : 'in';
}
