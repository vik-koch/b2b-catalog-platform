import {
  BoxDimensions,
  ProductListItem,
  ProductPackagingInfo,
  UnitPrices,
  piecePriceMilliMinor,
  piecesPerUnit,
  totalMinor,
} from '@b2b-catalog-platform/shared';
import { and, isNotNull, isNull } from 'drizzle-orm';
import { ProductImageRef, products } from '../db/schema';

/**
 * Stored product rows → the prices and packaging the read contract publishes.
 * Rows carry the price of `priceBasisPieces` pieces; the API publishes prices
 * already resolved per unit, and the basis itself never leaves.
 */

/**
 * What the storefront may show: live, and published by an admin. Beside the
 * columns rather than inside the catalog service, because every reader of a
 * product needs it — the cart prices what a customer may buy, not what exists —
 * and a second copy is a forgotten call site waiting to happen.
 */
export const publiclyVisible = and(
  isNull(products.deletedAt),
  isNotNull(products.publishedAt),
);

/** Selected by every product read, so the paths cannot drift. */
export const unitColumns = {
  priceBasisPieces: products.priceBasisPieces,
  piecesPerPack: products.piecesPerPack,
  packsPerBox: products.packsPerBox,
  minPieceQty: products.minPieceQty,
} as const;

export interface PricedProductRow {
  /** Tier-resolved, covering `priceBasisPieces` pieces. */
  priceMinor: number;
  priceBasisPieces: number;
  piecesPerPack: number | null;
  packsPerBox: number | null;
  minPieceQty: number;
}

/** A projection rather than the row: it is what keeps the basis out of the
 * response. */
export function packagingOf(row: PricedProductRow): ProductPackagingInfo {
  return {
    piecesPerPack: row.piecesPerPack,
    packsPerBox: row.packsPerBox,
    minPieceQty: row.minPieceQty,
  };
}

/**
 * Pack and box prices are exact whole minor units — a pack is a whole number of
 * basis units, so `totalMinor` has no remainder. It returns null only if that
 * invariant is broken, surfacing as a missing price rather than a wrong one.
 */
export function unitPricesOf(row: PricedProductRow): UnitPrices {
  const packaging = packagingOf(row);
  const priceFor = (unit: 'pack' | 'box'): number | null => {
    const pieces = piecesPerUnit(packaging, unit);
    return pieces === null
      ? null
      : totalMinor(row.priceMinor, row.priceBasisPieces, pieces);
  };

  return {
    pieceMilliMinor: piecePriceMilliMinor(row.priceMinor, row.priceBasisPieces),
    // The multiplicable piece figure: exact by construction, since the basis
    // divides minPieceQty (products_basis_divides_quantities).
    pieceLotMinor: totalMinor(
      row.priceMinor,
      row.priceBasisPieces,
      row.minPieceQty,
    ),
    pack: priceFor('pack'),
    box: priceFor('box'),
  };
}

/** The rounded per-piece price the pre-units surfaces still read. */
export function displayPriceMinor(row: PricedProductRow): number {
  return Math.round(row.priceMinor / row.priceBasisPieces);
}

export function toListItem<
  T extends PricedProductRow & {
    slug: string;
    name: string;
    images: ProductImageRef[];
  },
>(row: T): ProductListItem {
  return {
    slug: row.slug,
    name: row.name,
    priceMinor: displayPriceMinor(row),
    prices: unitPricesOf(row),
    packaging: packagingOf(row),
    images: row.images,
  };
}

/** Kept as the decimal strings Postgres returns: they are shown, not calculated
 * with, and a float round-trip would turn 1.250 into 1.25. */
export function boxDimensionsOf(row: {
  packsPerBox: number | null;
  boxVolume: string | null;
  boxWeight: string | null;
  boxCount: number;
}): BoxDimensions | null {
  if (row.packsPerBox === null) return null;
  return { volume: row.boxVolume, weight: row.boxWeight, count: row.boxCount };
}
