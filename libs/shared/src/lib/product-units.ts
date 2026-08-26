/**
 * The arithmetic of selling by the piece, the pack and the box. Shared because
 * the API prices carts and the browser corrects quantities, and the two must not
 * drift.
 *
 * **Pieces are the quantity; a unit is a lens.** A line holds one integer piece
 * count, and the unit it is bought in only decides how that count is read out
 * and stepped — 2 pk of a ten-pack box is 0.2 bx, the same twenty pieces either
 * way. Nothing fractional is ever stored, priced or shipped: the fraction is a
 * rendering of an integer.
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

/**
 * How many decimals a quantity is read out to through a lens. Three, because a
 * pack is rarely more than a thousandth of a box and a figure nobody can act on
 * is noise: 0.025 bx is two packs of a forty-pack box, and a fourth decimal
 * would only ever say which rounding happened.
 */
export const UNIT_QUANTITY_DECIMALS = 3;
export const QUANTITY_SCALE = 10 ** UNIT_QUANTITY_DECIMALS;

/**
 * The most pieces one line may hold. A guard against a typed figure that is
 * not an order, and the contract's own ceiling (`cartLineSchema`) — stated
 * here because every quantity that reaches it is corrected through this file
 * first, and a line that only the server refuses is one the customer cannot
 * see is wrong.
 */
export const LINE_PIECES_MAX = 1_000_000;

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
 * The smallest orderable piece count: the minimum, raised onto the step
 * lattice.
 *
 * One figure for every lens. It used to be rounded up to a whole pack or box
 * for those units, because a quantity in them was itself an integer; now that a
 * lens only reads pieces out, half a box is a perfectly ordinary way of saying
 * "one pack" and there is nothing left to round.
 *
 * `minimumIsWholeSteps` keeps the raising a no-op in practice; it is here so a
 * row that predates the rule, or slips past it, still lands on the lattice
 * rather than one step below it.
 */
export function pieceFloor(packaging: ProductPackaging): number {
  const min = Math.max(1, Math.trunc(packaging.minPieceQty));
  const step = pieceStep(packaging);
  return Math.ceil(min / step) * step;
}

/**
 * How many pieces one press of the stepper moves, seen through `unit`: one of
 * that unit, except that pieces move by a pack — the smallest thing the shop
 * can actually pick.
 *
 * Always a whole number of steps, so stepping through any lens keeps the piece
 * count on the lattice: a box is a whole number of packs by construction.
 */
export function stepPieces(
  packaging: ProductPackaging,
  unit: ProductUnit,
): number {
  return Math.max(pieceStep(packaging), piecesPerUnit(packaging, unit) ?? 1);
}

/**
 * Where one press of the stepper lands, from `pieces`, seen through `unit`.
 *
 * It **snaps to whole units rather than adding one**: `+` on a quarter of a box
 * is one box, not one and a quarter. A reading that is already whole moves by a
 * whole one either way. The lattice is counted from nothing, so a press always
 * lands on a figure the unit can say plainly — which is the point of pressing a
 * stepper rather than typing.
 *
 * May land below `pieceFloor`, and deliberately does: what to do down there is
 * the caller's decision, not this one's.
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
 * Whether a quantity read through `unit` is always a whole number.
 *
 * It is for every unit at or below the step: a piece count is a whole number of
 * packs by construction, so a pack reading cannot be a fraction and a field
 * offering it decimals would only invite one to be typed and rounded away. Only
 * a box — which holds several steps — reads in fractions.
 */
export function unitQuantityIsWhole(
  packaging: ProductPackaging,
  unit: ProductUnit,
): boolean {
  const per = piecesPerUnit(packaging, unit);
  return per === null || per <= pieceStep(packaging);
}

/**
 * The nearest orderable piece count at or above `pieces`: never below the
 * floor, and a whole number of steps above it. Rounds up, never down —
 * silently reducing an order is worse than selling more and saying so.
 *
 * The one exception is the ceiling, where up is nowhere: past `LINE_PIECES_MAX`
 * the last quantity on the lattice below it is the only answer that is still an
 * order. A figure that far out is a typing accident rather than a quantity —
 * through a box lens it takes only four digits to reach — and the correction
 * reports itself like any other.
 */
export function correctPieces(
  packaging: ProductPackaging,
  pieces: number,
): number {
  const step = pieceStep(packaging);
  const floor = pieceFloor(packaging);
  const wanted = Math.trunc(pieces);
  if (wanted <= floor) return floor;
  // The ceiling is checked against the raised figure, not the typed one:
  // raising rounds up, so a quantity under the ceiling can be lifted over it.
  const raised = Math.ceil(wanted / step) * step;
  if (raised <= LINE_PIECES_MAX) return raised;
  return Math.max(floor, Math.floor(LINE_PIECES_MAX / step) * step);
}

/**
 * `pieces` read through `unit` — the figure the customer sees beside the unit
 * they chose. Rounded to `UNIT_QUANTITY_DECIMALS`, which is the only rounding
 * in the model and touches nothing that is stored, priced or shipped.
 *
 * Null for a unit the product is not sold in: there is no lens to read through.
 */
export function unitQuantity(
  packaging: ProductPackaging,
  unit: ProductUnit,
  pieces: number,
): number | null {
  const per = piecesPerUnit(packaging, unit);
  if (per === null || per < 1) return null;
  return Math.round((pieces / per) * QUANTITY_SCALE) / QUANTITY_SCALE;
}

/**
 * The inverse: a figure typed through `unit`, back to pieces. Deliberately not
 * corrected — `correctPieces` is the separate act, so a field can hold what is
 * being typed and only snap when it is left.
 *
 * Rounded **up** to whole pieces, so a quantity typed between two of them buys
 * the piece it reaches into rather than the one below it, and never below one.
 * Worked in thousandths rather than by multiplying floats: 0.3 × 240 is
 * 72.00000000000001 in binary, and a ceiling over that buys a piece nobody
 * asked for.
 *
 * Null for a unit the product is not sold in.
 */
export function piecesFromUnitQuantity(
  packaging: ProductPackaging,
  unit: ProductUnit,
  quantity: number,
): number | null {
  const per = piecesPerUnit(packaging, unit);
  if (per === null || per < 1) return null;
  const thousandths = Math.round(quantity * QUANTITY_SCALE);
  return Math.max(1, Math.ceil((thousandths * per) / QUANTITY_SCALE));
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
 * This is what lets one lot price describe every quantity: with the minimum on
 * the step lattice, every orderable piece count is a multiple of the step, so a
 * total is `pieceLotMinor × (pieces ÷ step)` with nothing divided and nothing
 * rounded. A minimum of 25 against a pack of 6 would put the first orderable
 * quantity off the lattice and cost a second published price to describe.
 * Mirrors `products_minimum_is_whole_packs`.
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
 * The chosen unit is not an argument, and that is the point: the pack and box
 * prices are labels on the same lattice the lot price describes, so pricing
 * through them would be a second expression for one figure, disagreeing by a
 * minor unit the first time a lens showed a fraction.
 *
 * Null wherever the total cannot be exact: a piece count that is not a whole
 * number of steps, or a missing lot price. A null is a state to show, never a
 * zero to fall back to.
 */
export function exactLineTotal(
  prices: LineUnitPrices,
  packaging: ProductPackaging,
  pieces: number,
): number | null {
  if (!Number.isInteger(pieces) || pieces < 1) return null;
  const step = pieceStep(packaging);
  if (prices.pieceLotMinor === null || pieces % step !== 0) return null;
  return (pieces / step) * prices.pieceLotMinor;
}
