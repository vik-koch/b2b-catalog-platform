import { piecesPerUnit, ProductPackaging } from '../catalog/product-units';

/**
 * The shipment summary (FR-UNIT-11). `boxVolume` and `boxWeight` are for one
 * box unit across its `boxCount` cartons, so only the carton count is ever
 * multiplied by `boxCount`. A part box scales the figures and rounds cartons
 * up, which is why the summary is approximate.
 */

/** Decimals travel as strings (a float turns 1.250 into 1.25), so sums are in
 * thousandths, the columns' scale. */
const SHIPMENT_DECIMAL_SCALE = 1000;

export interface ShipmentLineInput {
  packaging: ProductPackaging;
  /** Pieces: a unit is a lens, and lenses weigh nothing. */
  pieces: number;
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
  coveredLines: number;
  uncoveredLines: number;
  /** True where any covered line did not fill whole boxes. */
  approximate: boolean;
}

/** Null, not zero: a missing weight is not a weightless product. */
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
    if (boxPieces === null || boxPieces < 1) {
      uncoveredLines += 1;
      continue;
    }
    coveredLines += 1;
    // Box units, as a fraction where the line does not fill whole boxes.
    const boxes = line.pieces / boxPieces;
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
