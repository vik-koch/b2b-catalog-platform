/**
 * The arithmetic of selling by the piece, the pack and the box. Shared because
 * the API prices carts and the browser corrects quantities, and the two must not
 * drift.
 */

export const PRODUCT_UNITS = ['piece', 'pack', 'box'] as const;
export type ProductUnit = (typeof PRODUCT_UNITS)[number];

/** Null pack/box mean the product is not sold in that unit. */
export interface ProductPackaging {
  piecesPerPack: number | null;
  packsPerBox: number | null;
  /** Minimum piece quantity, and equally the increment. */
  minPieceQty: number;
}

/** Thousandths of a minor unit, the scale the per-piece price is carried in. */
export const PIECE_PRICE_SCALE = 1000;

export function piecesPerUnit(
  packaging: ProductPackaging,
  unit: ProductUnit,
): number | null {
  const { piecesPerPack, packsPerBox } = packaging;
  if (unit === 'piece') return 1;
  if (unit === 'pack') return piecesPerPack;
  if (piecesPerPack === null || packsPerBox === null) return null;
  return piecesPerPack * packsPerBox;
}

/** The units this product can be bought in, smallest first. */
export function availableUnits(packaging: ProductPackaging): ProductUnit[] {
  return PRODUCT_UNITS.filter(
    (unit) => piecesPerUnit(packaging, unit) !== null,
  );
}

/** Null for a unit the product is not sold in, so nothing can price a box that
 * does not exist. */
export function piecesFor(
  packaging: ProductPackaging,
  unit: ProductUnit,
  quantity: number,
): number | null {
  const pieces = piecesPerUnit(packaging, unit);
  return pieces === null ? null : pieces * quantity;
}

/**
 * The nearest valid piece quantity at or above `quantity`. Rounds up, never
 * down: silently reducing an order is worse than selling more and saying so.
 * Packs and boxes are unconstrained — they are already quantities the shop sells.
 */
export function correctPieceQuantity(
  packaging: ProductPackaging,
  quantity: number,
): number {
  const step = Math.max(1, Math.trunc(packaging.minPieceQty));
  const wanted = Math.trunc(quantity);
  if (wanted <= step) return step;
  return Math.ceil(wanted / step) * step;
}

/** Whether a correction would change the quantity, so the UI knows to say so. */
export function isValidPieceQuantity(
  packaging: ProductPackaging,
  quantity: number,
): boolean {
  return (
    Number.isInteger(quantity) &&
    correctPieceQuantity(packaging, quantity) === quantity
  );
}

/**
 * What `pieces` pieces cost, in whole minor units, where `priceMinor` is the
 * price of `basisPieces` pieces.
 *
 * Null rather than a rounded price when `pieces` is not a whole number of basis
 * units: that means a caller bypassed the quantity rules, and a plausible number
 * would hide the bug.
 */
export function totalMinor(
  priceMinor: number,
  basisPieces: number,
  pieces: number,
): number | null {
  if (basisPieces < 1 || pieces % basisPieces !== 0) return null;
  return priceMinor * (pieces / basisPieces);
}

/**
 * The per-piece price, in thousandths of a minor unit. The one figure that can
 * be inexact (€19.99 for ten pieces is €1.999), so it is for display only —
 * totals come from `totalMinor`.
 */
export function piecePriceMilliMinor(
  priceMinor: number,
  basisPieces: number,
): number {
  return Math.round((priceMinor * PIECE_PRICE_SCALE) / basisPieces);
}

/**
 * Whether the basis divides every quantity that can be bought, which is what
 * keeps totals exact. Mirrors the `products_basis_divides_quantities` check
 * constraint so the editor can refuse with a useful message.
 */
export function basisDividesQuantities(
  packaging: ProductPackaging,
  basisPieces: number,
): boolean {
  if (basisPieces < 1) return false;
  if (packaging.minPieceQty % basisPieces !== 0) return false;
  return (
    packaging.piecesPerPack === null ||
    packaging.piecesPerPack % basisPieces === 0
  );
}
