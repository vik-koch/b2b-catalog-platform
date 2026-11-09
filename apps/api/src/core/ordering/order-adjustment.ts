import { BadRequestException } from '@nestjs/common';
import { inArray } from 'drizzle-orm';

import {
  piecesPerUnit,
  ProductAvailability,
  ProductUnit,
  shownPictures,
  totalMinor,
  unitQuantity,
} from '@b2b-catalog-platform/shared/core/catalog';
import {
  AdjustmentLineFlag,
  OrderAdjustmentLine,
  shipmentEstimate,
  ShipmentLineInput,
} from '@b2b-catalog-platform/shared/core/ordering';

import { Database } from '../../platform/db/database';
import {
  products,
  type ProductImageRef,
  type ProductVariantRef,
} from '../catalog/catalog-schema';
import { resolvedPriceMinor } from '../catalog/product-price';
import { packagingOf, unitColumns } from '../catalog/product-view';

/**
 * Pricing an order as a manager writes it (FR-ORD-03), unlike a cart: a line
 * keeps the price it carries, the whole catalog is in scope, and quantities are
 * pieces, so a total is a multiplication with nothing to round.
 */

export interface PricedAdjustmentLine {
  slug: string;
  productId: string;
  sourceId: string;
  name: string;
  thumbnail: string | null;
  unit: ProductUnit;
  pieces: number;
  quantity: number;
  priceMinor: number;
  lineTotalMinor: number;
  note: string | null;
  /** The rate the new version states for this line (NFR-LEGAL-11). */
  taxRate: number | null;
  flags: AdjustmentLineFlag[];
  /**
   * Today's list price for one piece, priced from the list or not, so a screen
   * can say a price is deliberate. Null where no list prices it.
   */
  listPriceMinor: number | null;
}

export interface PricedAdjustment {
  lines: PricedAdjustmentLine[];
  totalMinor: number;
  shipment: ReturnType<typeof shipmentEstimate>;
}

type ProductRow = {
  id: string;
  slug: string;
  name: string;
  sourceId: string;
  /** Null where no list prices it: staff name the price. */
  priceMinor: number | null;
  images: ProductImageRef[];
  variants: ProductVariantRef[];
  boxVolume: string | null;
  boxWeight: string | null;
  boxCount: number;
  availability: ProductAvailability | null;
  publishedAt: Date | null;
  deletedAt: Date | null;
  /** The product's own rate; null is the deployment's default. */
  taxRate: number | null;
  piecesPerPack: number | null;
  packsPerBox: number | null;
  minPieceQty: number;
};

/** `taxRateOf` resolves a product's rate under the order's own basis. */
export async function priceAdjustment(
  db: Database,
  lines: readonly OrderAdjustmentLine[],
  tierId: string | null,
  taxRateOf: (own: number | null) => number | null,
): Promise<PricedAdjustment> {
  const rows = await loadProducts(db, lines, tierId);
  const priced = lines.map((line) =>
    priceLine(line, taxRateOf, rows.get(line.slug)),
  );

  const shipmentLines: ShipmentLineInput[] = priced.map((line) => {
    const product = rows.get(line.slug) as ProductRow;
    return {
      packaging: packagingOf(product),
      pieces: line.pieces,
      boxVolume: product.boxVolume,
      boxWeight: product.boxWeight,
      boxCount: product.boxCount,
    };
  });

  return {
    lines: priced,
    totalMinor: priced.reduce((sum, line) => sum + line.lineTotalMinor, 0),
    shipment: shipmentEstimate(shipmentLines),
  };
}

async function loadProducts(
  db: Database,
  lines: readonly OrderAdjustmentLine[],
  tierId: string | null,
): Promise<Map<string, ProductRow>> {
  const slugs = [...new Set(lines.map((line) => line.slug))];
  if (slugs.length === 0) return new Map();

  // No visibility filter: staff see the catalog whole.
  const rows = await db
    .select({
      id: products.id,
      slug: products.slug,
      name: products.name,
      sourceId: products.sourceId,
      priceMinor: resolvedPriceMinor(tierId),
      images: products.images,
      variants: products.variants,
      boxVolume: products.boxVolume,
      boxWeight: products.boxWeight,
      boxCount: products.boxCount,
      availability: products.availability,
      publishedAt: products.publishedAt,
      deletedAt: products.deletedAt,
      taxRate: products.taxRate,
      ...unitColumns,
    })
    .from(products)
    .where(inArray(products.slug, slugs));

  const found = new Map(rows.map((row) => [row.slug, row]));
  for (const slug of slugs) {
    if (found.has(slug)) continue;
    // Refused, not flagged: a slug nothing answers to was built against another
    // catalog.
    throw new BadRequestException({
      code: 'unknown-product',
      message: `No product is called ${slug}`,
    });
  }
  return found;
}

function priceLine(
  line: OrderAdjustmentLine,
  taxRateOf: (own: number | null) => number | null,
  product?: ProductRow,
): PricedAdjustmentLine {
  // `loadProducts` refuses a slug it cannot resolve; this narrows the type.
  if (!product) throw new Error('an unresolved line reached the pricer');

  const packaging = packagingOf(product);
  // The line's price or the list's; nothing can invent one.
  const priceMinor = line.priceMinor ?? product.priceMinor;
  if (priceMinor === null) {
    throw new BadRequestException({
      code: 'product-has-no-price',
      message: `${product.slug} has no price in any list; give the line a price`,
    });
  }
  const pieces = line.pieces;
  const lineTotalMinor = totalMinor(priceMinor, pieces);

  // The unit falls back to the piece; a line staff added starts there.
  const asked = line.unit ?? 'piece';
  const unit = piecesPerUnit(packaging, asked) === null ? 'piece' : asked;

  const flags: AdjustmentLineFlag[] = [];
  if (product.deletedAt) flags.push('deleted');
  else if (!product.publishedAt) flags.push('unpublished');
  if (product.availability === 'out') flags.push('out-of-stock');

  return {
    slug: product.slug,
    productId: product.id,
    sourceId: product.sourceId,
    name: product.name,
    // What the customer would have been shown, as a cart line takes it.
    thumbnail:
      shownPictures(product.images, product.variants)[0]?.thumb ?? null,
    unit,
    pieces,
    quantity: unitQuantity(packaging, unit, pieces) ?? pieces,
    priceMinor,
    lineTotalMinor,
    note: line.note,
    // Today's rate: a version is the order as it reads when written.
    taxRate: taxRateOf(product.taxRate),
    flags,
    listPriceMinor: product.priceMinor,
  };
}
