import {
  BoxDimensions,
  ProductAvailability,
  ProductListItem,
  ProductPackagingInfo,
  UnitPrices,
  piecesPerUnit,
  totalMinor,
} from '@b2b-catalog-platform/shared';
import { and, isNotNull, isNull } from 'drizzle-orm';
import { ProductImageRef, products } from '../db/schema';

/**
 * Stored product rows → the prices and packaging the read contract publishes.
 * A stored price is the price of one piece; the API publishes it multiplied
 * out to every unit the product is sold in.
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
  piecesPerPack: products.piecesPerPack,
  packsPerBox: products.packsPerBox,
  minPieceQty: products.minPieceQty,
} as const;

/** What a listing needs beyond the price to sell a line the way the product
 * page does. */
export const noteColumns = {
  lineNoteEnabled: products.lineNoteEnabled,
  lineNotePrompt: products.lineNotePrompt,
} as const;

/** The stored state, never the count behind it (FR-STOCK-01). Its own group so
 * that reading a product publicly cannot pick up the figure by accident. */
export const availabilityColumns = {
  availability: products.availability,
} as const;

export interface PricedProductRow {
  /** Tier-resolved, the price of one piece. */
  priceMinor: number;
  piecesPerPack: number | null;
  packsPerBox: number | null;
  minPieceQty: number;
}

export function packagingOf(
  row: Omit<PricedProductRow, 'priceMinor'>,
): ProductPackagingInfo {
  return {
    piecesPerPack: row.piecesPerPack,
    packsPerBox: row.packsPerBox,
    minPieceQty: row.minPieceQty,
  };
}

/** Every unit's price is the piece price multiplied out, so all three are
 * exact whole minor units and null means only that the product is not sold in
 * that unit. */
export function unitPricesOf(row: PricedProductRow): UnitPrices {
  const packaging = packagingOf(row);
  const priceFor = (unit: 'pack' | 'box'): number | null => {
    const pieces = piecesPerUnit(packaging, unit);
    return pieces === null ? null : totalMinor(row.priceMinor, pieces);
  };

  return {
    piece: row.priceMinor,
    pack: priceFor('pack'),
    box: priceFor('box'),
  };
}

export function toListItem<
  T extends PricedProductRow & {
    slug: string;
    name: string;
    images: ProductImageRef[];
    lineNoteEnabled: boolean;
    lineNotePrompt: string | null;
    availability: ProductAvailability | null;
    pairedCount: number;
  },
>(row: T): ProductListItem {
  return {
    slug: row.slug,
    name: row.name,
    priceMinor: row.priceMinor,
    prices: unitPricesOf(row),
    packaging: packagingOf(row),
    images: row.images,
    lineNoteEnabled: row.lineNoteEnabled,
    lineNotePrompt: row.lineNotePrompt,
    availability: row.availability,
    pairedCount: row.pairedCount,
  };
}

/**
 * The same row for a staff screen, where a product may have no price at all.
 * Separate from `toListItem` rather than making that one's price nullable: the
 * storefront cannot show an unpriced product — publication refuses it — and a
 * null the whole shop front would have to carry for one admin panel's sake is
 * a null in the wrong place.
 */
export function toUnpricedListItem<
  T extends Omit<PricedProductRow, 'priceMinor'> & {
    priceMinor: number | null;
    slug: string;
    name: string;
    images: ProductImageRef[];
    lineNoteEnabled: boolean;
    lineNotePrompt: string | null;
    availability: ProductAvailability | null;
    pairedCount: number;
  },
>(
  row: T,
): Omit<ProductListItem, 'priceMinor' | 'prices'> & {
  priceMinor: number | null;
  prices: UnitPrices | null;
} {
  const priceMinor = row.priceMinor;
  return {
    ...toListItem({ ...row, priceMinor: priceMinor ?? 0 }),
    priceMinor,
    prices: priceMinor === null ? null : unitPricesOf({ ...row, priceMinor }),
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
