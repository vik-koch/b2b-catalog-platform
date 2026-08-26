import {
  ProductPackaging,
  ProductUnit,
  piecesFor,
  piecesPerUnit,
} from './product-units';

/**
 * The cart's shipment summary (FR-UNIT-11) — how many cartons the order is,
 * and what they weigh and take up.
 *
 * The arithmetic, once, because the two figures read as if they contradicted
 * each other: `boxVolume`/`boxWeight` are the totals for **one box unit**
 * across the `boxCount` cartons it ships as, so nothing is ever multiplied by
 * `boxCount` except the carton count itself. A line of *q* box units is
 * `q × boxCount` cartons, `q × boxVolume` and `q × boxWeight`.
 *
 * A line bought by the piece or the pack is the same figures scaled by the
 * fraction of a box it fills, with cartons rounded up to whole ones: 50 pieces
 * of a 100-piece box is one carton, 101 is two. That is an estimate — hence the
 * whole summary being labelled approximate and confirmed by a manager — and a
 * product with no box defined has no shipping figures at all, which the summary
 * says rather than silently omitting.
 */

/** Decimals are carried as strings end to end (a float round-trip turns 1.250
 * into 1.25), so the sums are done in thousandths, the scale the columns hold. */
export const SHIPMENT_DECIMAL_SCALE = 1000;

export interface ShipmentLineInput {
  packaging: ProductPackaging;
  unit: ProductUnit;
  quantity: number;
  /** As stored: decimal strings for one box unit, null where unknown. */
  boxVolume: string | null;
  boxWeight: string | null;
  boxCount: number;
}

export interface ShipmentEstimate {
  /** Whole cartons, rounded up. */
  cartons: number;
  /** Decimal strings again, or null where no covered line stated one. */
  volume: string | null;
  weight: string | null;
  /** How many lines the figures cover, and how many have no box to derive
   * from — a summary that covers half the cart must say so. */
  coveredLines: number;
  uncoveredLines: number;
  /** True where any covered line was a part-box (piece or pack) estimate. */
  approximate: boolean;
}

/** Null rather than zero for an unparseable or absent decimal: a missing weight
 * is not a weightless product. */
function toThousandths(value: string | null): number | null {
  if (value === null) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.round(parsed * SHIPMENT_DECIMAL_SCALE);
}

function fromThousandths(value: number | null): string | null {
  if (value === null) return null;
  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(value);
  const whole = Math.trunc(abs / SHIPMENT_DECIMAL_SCALE);
  const rest = String(abs % SHIPMENT_DECIMAL_SCALE).padStart(3, '0');
  return `${sign}${whole}.${rest}`;
}

export function shipmentEstimate(
  lines: readonly ShipmentLineInput[],
): ShipmentEstimate {
  let cartons = 0;
  let volume: number | null = null;
  let weight: number | null = null;
  let coveredLines = 0;
  let uncoveredLines = 0;
  let approximate = false;

  for (const line of lines) {
    const boxPieces = piecesPerUnit(line.packaging, 'box');
    const pieces = piecesFor(line.packaging, line.unit, line.quantity);
    if (boxPieces === null || boxPieces < 1 || pieces === null) {
      uncoveredLines += 1;
      continue;
    }
    coveredLines += 1;
    // Box units, as a fraction where the line does not fill whole boxes.
    const boxes = pieces / boxPieces;
    if (!Number.isInteger(boxes)) approximate = true;
    cartons += Math.ceil(boxes * line.boxCount);

    const lineVolume = toThousandths(line.boxVolume);
    if (lineVolume !== null) {
      volume = (volume ?? 0) + Math.round(lineVolume * boxes);
    }
    const lineWeight = toThousandths(line.boxWeight);
    if (lineWeight !== null) {
      weight = (weight ?? 0) + Math.round(lineWeight * boxes);
    }
  }

  return {
    cartons,
    volume: fromThousandths(volume),
    weight: fromThousandths(weight),
    coveredLines,
    uncoveredLines,
    approximate,
  };
}
