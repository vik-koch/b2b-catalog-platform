/**
 * The arithmetic of selling by the piece, the pack and the box, shared so the
 * API pricing a cart and the browser correcting a quantity cannot drift.
 *
 * Pieces are the quantity; a unit is a lens. A line holds one integer piece
 * count, and its unit only decides how that count is read out and stepped: 2 pk
 * of a ten-pack box is 0.2 bx, the same twenty pieces. Nothing fractional is
 * stored, priced or shipped.
 */

export const PRODUCT_UNITS = ['piece', 'pack', 'box'] as const;
export type ProductUnit = (typeof PRODUCT_UNITS)[number];

/** How the units nest. Null means the product is not sold in that unit. */
export interface UnitSizes {
  piecesPerPack: number | null;
  packsPerBox: number | null;
}

export interface ProductPackaging extends UnitSizes {
  /** The smallest piece quantity the shop will sell: a commercial floor. */
  minPieceQty: number;
}

/**
 * Decimals a quantity is read out to through a lens. A fourth would only say
 * which rounding happened: 0.025 bx is already two packs of a forty-pack box.
 */
const UNIT_QUANTITY_DECIMALS = 3;
export const QUANTITY_SCALE = 10 ** UNIT_QUANTITY_DECIMALS;

/**
 * The most pieces one line may hold, and the contract's own ceiling
 * (`cartLineSchema`). Stated here because every quantity is corrected through
 * this file first, so the customer sees a correction rather than a refusal.
 */
export const LINE_PIECES_MAX = 1_000_000;

export function piecesPerUnit(
  sizes: UnitSizes,
  unit: ProductUnit,
): number | null {
  const { piecesPerPack, packsPerBox } = sizes;
  if (unit === 'piece') return 1;
  if (unit === 'pack') return piecesPerPack;
  if (piecesPerPack === null || packsPerBox === null) return null;
  return piecesPerPack * packsPerBox;
}

/** The units this product can be bought in, smallest first. */
export function availableUnits(sizes: UnitSizes): ProductUnit[] {
  return PRODUCT_UNITS.filter((unit) => piecesPerUnit(sizes, unit) !== null);
}

/**
 * What a piece quantity moves in: one pack where the minimum is a whole number
 * of packs, so the shop never breaks one open. A shop that sells fewer pieces
 * than a pack opens packs already, so its quantity moves by ones. Without a
 * pack, the minimum is the one quantity known to sell.
 *
 * Not the minimum itself: the minimum is how little the shop will ship, the
 * step what the goods come in. A shop that will not sell fewer than 24 must
 * still sell 30.
 */
export function pieceStep(packaging: ProductPackaging): number {
  const min = Math.max(1, Math.trunc(packaging.minPieceQty));
  const lot = Math.max(
    1,
    Math.trunc(packaging.piecesPerPack ?? packaging.minPieceQty),
  );
  return min % lot === 0 ? lot : 1;
}

/**
 * The smallest orderable piece count, the same through every lens: the
 * minimum, raised onto the step. `minimumFitsPacks` keeps the raise a no-op; it
 * is here for a row that slipped past that rule.
 */
export function pieceFloor(packaging: ProductPackaging): number {
  const min = Math.max(1, Math.trunc(packaging.minPieceQty));
  const step = pieceStep(packaging);
  return Math.ceil(min / step) * step;
}

/**
 * How many pieces one press of the stepper moves through `unit`: one of that
 * unit, but never less than the step, so stepping keeps a count on the lattice.
 */
export function stepPieces(
  packaging: ProductPackaging,
  unit: ProductUnit,
): number {
  return Math.max(pieceStep(packaging), piecesPerUnit(packaging, unit) ?? 1);
}

/**
 * Where one press of the stepper lands from `pieces`. It snaps to whole units
 * rather than adding one: `+` on a quarter box is one box, not one and a
 * quarter.
 *
 * May land below `pieceFloor`; what happens there is the caller's decision.
 */
export function stepFrom(
  packaging: ProductPackaging,
  unit: ProductUnit,
  pieces: number,
  direction: 1 | -1,
): number {
  const step = stepPieces(packaging, unit);
  const over = pieces % step;
  if (direction === 1) return pieces - over + step;
  return over === 0 ? pieces - step : pieces - over;
}

/**
 * Whether a quantity read through `unit` is always whole: true for every unit
 * no larger than the step, so its field offers no decimals to round away.
 */
export function unitQuantityIsWhole(
  packaging: ProductPackaging,
  unit: ProductUnit,
): boolean {
  const per = piecesPerUnit(packaging, unit);
  return per === null || per <= pieceStep(packaging);
}

/**
 * The nearest orderable piece count at or above `pieces`. Rounds up, never
 * down: silently reducing an order is worse than selling more and saying so.
 * Past `LINE_PIECES_MAX` there is no up, so the last count on the lattice below
 * it is the answer.
 */
export function correctPieces(
  packaging: ProductPackaging,
  pieces: number,
): number {
  const step = pieceStep(packaging);
  const floor = pieceFloor(packaging);
  const wanted = Math.trunc(pieces);
  if (wanted <= floor) return floor;
  // Checked after raising: rounding up can lift a quantity over the ceiling.
  const raised = Math.ceil(wanted / step) * step;
  if (raised <= LINE_PIECES_MAX) return raised;
  return Math.max(floor, Math.floor(LINE_PIECES_MAX / step) * step);
}

/**
 * `pieces` read through `unit`, rounded to the lens's decimals: the only
 * rounding in the model, and it touches nothing stored, priced or shipped.
 * Null for a unit the product is not sold in.
 */
export function unitQuantity(
  sizes: UnitSizes,
  unit: ProductUnit,
  pieces: number,
): number | null {
  const per = piecesPerUnit(sizes, unit);
  if (per === null || per < 1) return null;
  return Math.round((pieces / per) * QUANTITY_SCALE) / QUANTITY_SCALE;
}

/**
 * A figure typed through `unit`, back to pieces, rounded up and never below
 * one. Not corrected: a field holds what is typed and snaps with
 * `correctPieces` when left. Null for a unit the product is not sold in.
 */
export function piecesFromUnitQuantity(
  sizes: UnitSizes,
  unit: ProductUnit,
  quantity: number,
): number | null {
  const per = piecesPerUnit(sizes, unit);
  if (per === null || per < 1) return null;
  // In thousandths: 0.3 × 240 is 72.00000000000001 as a float, and a ceiling
  // over that buys a piece nobody asked for.
  const thousandths = Math.round(quantity * QUANTITY_SCALE);
  return Math.max(1, Math.ceil((thousandths * per) / QUANTITY_SCALE));
}

/** What `pieces` pieces cost, in whole minor units: a price is per piece. */
export function totalMinor(priceMinor: number, pieces: number): number {
  return priceMinor * pieces;
}

/**
 * Whether the minimum sits under one pack or on a whole number of them. A
 * minimum of 8 against a pack of 6 is refused rather than modelled: its first
 * orderable quantity would sit off every lattice the stepper walks.
 *
 * Mirrors `products_minimum_fits_packs`.
 */
export function minimumFitsPacks(packaging: ProductPackaging): boolean {
  const pack = packaging.piecesPerPack;
  if (pack === null) return true;
  return packaging.minPieceQty < pack || packaging.minPieceQty % pack === 0;
}

/**
 * A line's prices as the read contract publishes them (`unitPricesSchema`),
 * declared structurally so this file stays out of the contract's imports.
 */
export interface LineUnitPrices {
  piece: number;
  pack: number | null;
  box: number | null;
}

/**
 * What a cart line costs, in whole minor units. The unit is not an argument:
 * pack and box prices label the same piece count, and pricing through them
 * would be a second figure for one total.
 *
 * Null for a piece count that is not a positive whole number: a caller skipped
 * the quantity rules, and a plausible figure would hide that.
 */
export function exactLineTotal(
  prices: LineUnitPrices,
  pieces: number,
): number | null {
  if (!Number.isInteger(pieces) || pieces < 1) return null;
  return prices.piece * pieces;
}
