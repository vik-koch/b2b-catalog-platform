import { type UnitSizes, piecesPerUnit } from './product-units';

/**
 * What a stock figure means to a customer (FR-STOCK-02). The count itself is
 * staff-facing and never leaves the API.
 */
export const PRODUCT_AVAILABILITIES = ['out', 'low', 'in'] as const;
export type ProductAvailability = (typeof PRODUCT_AVAILABILITIES)[number];

/**
 * The "few left" line for a product sold loose, where no deployment has said
 * otherwise. Shared so the badge the API decides and the hint the admin form
 * shows cannot disagree.
 */
export const DEFAULT_LOW_STOCK_THRESHOLD_PIECES = 10;

/**
 * Where "few left" sits: a product's own override, else the pieces in one box,
 * one pack, or the deployment's figure. The box comes first because the shop
 * restocks in boxes: one box left is one order from empty.
 */
export function lowStockThreshold(
  sizes: UnitSizes,
  override: number | null,
  fallback: number,
): number {
  if (override !== null) return override;
  return piecesPerUnit(sizes, 'box') ?? sizes.piecesPerPack ?? fallback;
}

/**
 * The state a stock figure resolves to, or null where the deployment does not
 * track this product's stock: no badge, no restriction.
 *
 * A negative figure is a stocktake correction, not an error: it reads as out of
 * stock, so the catalog is right again without a cleanup pass.
 */
export function productAvailability(
  stockPieces: number | null,
  sizes: UnitSizes,
  override: number | null,
  fallback: number,
): ProductAvailability | null {
  if (stockPieces === null) return null;
  if (stockPieces <= 0) return 'out';
  return stockPieces <= lowStockThreshold(sizes, override, fallback)
    ? 'low'
    : 'in';
}
