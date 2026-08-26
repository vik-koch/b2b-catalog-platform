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
  /**
   * The smallest piece quantity the shop will sell — a commercial floor.
   */
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
 * What a piece quantity moves in: **one pack**, because a pack is what cannot be
 * broken open. A product with no pack has nothing to stop it moving by ones, so
 * its own minimum serves — that is the only quantity it is known to sell in.
 *
 * Deliberately not the minimum, which is a separate thing: the minimum says how
 * little the shop will bother shipping, the step says what the goods physically
 * come in. Fusing them made a shop that will not sell fewer than 24 also refuse
 * to sell 30.
 */
export function pieceStep(packaging: ProductPackaging): number {
  const step = packaging.piecesPerPack ?? packaging.minPieceQty;
  return Math.max(1, Math.trunc(step));
}

/**
 * What a quantity in `unit` moves by. Packs and boxes move by one of
 * themselves — they are already quantities the shop picks — so only the piece
 * has a step worth computing.
 */
export function unitStep(
  packaging: ProductPackaging,
  unit: ProductUnit,
): number {
  return unit === 'piece' ? pieceStep(packaging) : 1;
}

/**
 * The smallest orderable quantity **in `unit`**.
 *
 * The minimum is one figure, stored in pieces, and it is a statement about the
 * goods rather than about the unit they are named in: a shop that will not ship
 * fewer than 24 pieces will not ship four packs of six either. So each unit
 * expresses that same minimum — 24 pieces is 4 packs of six, or 1 box of 24 —
 * rounded up to a whole one of that unit, since half a pack is not something
 * the shop picks.
 *
 * Applying it to pieces alone, as it once was, made the rule bypassable by
 * changing unit: one pack of six is six pieces, which is under a minimum of 24.
 *
 * Null for a unit the product is not sold in — there is no quantity of it.
 */
export function unitFloor(
  packaging: ProductPackaging,
  unit: ProductUnit,
): number | null {
  const min = Math.max(1, Math.trunc(packaging.minPieceQty));
  if (unit === 'piece') {
    // Raised onto the step lattice. `minimumIsWholeSteps` keeps that a no-op in
    // practice; the rounding is here so a row that predates the rule, or slips
    // past it, still lands on the lattice rather than one step below it.
    const step = pieceStep(packaging);
    return Math.ceil(min / step) * step;
  }
  const pieces = piecesPerUnit(packaging, unit);
  if (pieces === null) return null;
  return Math.max(1, Math.ceil(min / pieces));
}

/**
 * The nearest valid quantity at or above `quantity`: never below the unit's
 * floor, and a whole number of steps above it. Rounds up, never down —
 * silently reducing an order is worse than selling more and saying so.
 */
export function correctQuantity(
  packaging: ProductPackaging,
  unit: ProductUnit,
  quantity: number,
): number {
  const step = unitStep(packaging, unit);
  const floor = unitFloor(packaging, unit) ?? step;
  const wanted = Math.trunc(quantity);
  if (wanted <= floor) return floor;
  // From the floor rather than from zero, so a floor that is not itself a whole
  // number of steps still yields reachable quantities.
  return floor + Math.ceil((wanted - floor) / step) * step;
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

/**
 * Whether the minimum is a whole number of steps — i.e. of packs, where the
 * product has them.
 *
 * This is what lets one lot price describe every piece quantity: with the
 * minimum on the step lattice, every orderable quantity is a multiple of the
 * step, so a total is `pieceLotMinor × (quantity ÷ step)` with nothing divided
 * and nothing rounded. A minimum of 25 against a pack of 6 would put the first
 * orderable quantity off the lattice and cost a second published price to
 * describe. Mirrors `products_minimum_is_whole_packs`.
 */
export function minimumIsWholeSteps(packaging: ProductPackaging): boolean {
  return packaging.minPieceQty % pieceStep(packaging) === 0;
}

/**
 * The prices a line total may be computed from, as the read contract publishes
 * them (`unitPricesSchema`). Structural rather than imported, so the arithmetic
 * stays free of the contract's import graph.
 */
export interface LineUnitPrices {
  /** What one step — `pieceStep` pieces — costs, exactly. */
  pieceLotMinor: number | null;
  pack: number | null;
  box: number | null;
}

/**
 * What a cart line costs, in whole minor units — the client-safe sibling of
 * `totalMinor`, which needs the staff-facing price basis.
 *
 * Null wherever the total cannot be exact: a unit the product is not sold in, a
 * piece quantity that is not a whole number of steps, or a missing price. A null
 * is a state to show, never a zero to fall back to.
 */
export function exactLineTotal(
  prices: LineUnitPrices,
  packaging: ProductPackaging,
  unit: ProductUnit,
  quantity: number,
): number | null {
  if (!Number.isInteger(quantity) || quantity < 1) return null;
  if (unit === 'piece') {
    const lot = pieceStep(packaging);
    if (prices.pieceLotMinor === null || quantity % lot !== 0) return null;
    return (quantity / lot) * prices.pieceLotMinor;
  }
  const price = unit === 'pack' ? prices.pack : prices.box;
  if (price === null || piecesPerUnit(packaging, unit) === null) return null;
  return price * quantity;
}

/**
 * A quantity moved to another unit of the same product. `exact` is false where
 * the pieces do not fill a whole target unit and the quantity was rounded up —
 * the caller asks before applying that, since it costs the customer more.
 * Null for a unit the product is not sold in.
 */
export interface ConvertedQuantity {
  quantity: number;
  exact: boolean;
}

export function convertUnitQuantity(
  packaging: ProductPackaging,
  from: ProductUnit,
  to: ProductUnit,
  quantity: number,
): ConvertedQuantity | null {
  const pieces = piecesFor(packaging, from, quantity);
  const perTarget = piecesPerUnit(packaging, to);
  if (pieces === null || perTarget === null) return null;
  if (to === 'piece') {
    const corrected = correctQuantity(packaging, 'piece', pieces);
    return { quantity: corrected, exact: corrected === pieces };
  }
  // The converted figure, then the target unit's own floor — a box order still
  // has to reach the minimum, however few boxes the held quantity came to.
  const converted = Math.max(1, Math.ceil(pieces / perTarget));
  const corrected = correctQuantity(packaging, to, converted);
  return {
    quantity: corrected,
    exact: pieces % perTarget === 0 && corrected === converted,
  };
}
