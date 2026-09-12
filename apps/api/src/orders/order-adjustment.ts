import { inArray } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { BadRequestException } from '@nestjs/common';
import {
  AdjustmentLineFlag,
  OrderAdjustmentLine,
  ProductAvailability,
  ProductUnit,
  ShipmentLineInput,
  piecesPerUnit,
  shipmentEstimate,
  totalMinor,
  unitQuantity,
} from '@b2b-catalog-platform/shared';
import * as schema from '../db/schema';
import { products } from '../db/schema';
import { resolvedPriceMinor } from '../catalog/product-price';
import { packagingOf, unitColumns } from '../catalog/product-view';

/**
 * Pricing an order the way a manager writes it (FR-ORD-03), which is not the
 * way a cart is priced.
 *
 * Three differences, and each is deliberate. **A line keeps the price it
 * carries** — an adjustment re-prices only what the manager re-priced, and a
 * line nobody touched must still cost what the customer was quoted, however
 * far the catalog has moved since. **The whole catalog is in scope**, deleted
 * and unpublished included: an order may already hold a withdrawn product, and
 * a shop filling one from something it no longer lists is doing ordinary work.
 * And **quantities are counted in pieces**, the unit every price is per, so a
 * line total is a multiplication with nothing to round.
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
  flags: AdjustmentLineFlag[];
  /** What the chosen list charges for one piece of this product today.
   * Answered on every line, priced from the list or not: it is what lets a
   * screen say a line was priced away from the list without working out either
   * figure for itself. Null when no list prices the product — the line then
   * carries a price staff typed, which is the only way it got here. */
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
  /** Null where no price list prices it — staff may still order it by naming
   * the price on the line. */
  priceMinor: number | null;
  images: schema.ProductImageRef[];
  boxVolume: string | null;
  boxWeight: string | null;
  boxCount: number;
  availability: ProductAvailability | null;
  publishedAt: Date | null;
  deletedAt: Date | null;
  piecesPerPack: number | null;
  packsPerBox: number | null;
  minPieceQty: number;
};

export async function priceAdjustment(
  db: NodePgDatabase<typeof schema>,
  lines: readonly OrderAdjustmentLine[],
  tierId: string | null,
): Promise<PricedAdjustment> {
  const rows = await loadProducts(db, lines, tierId);
  const priced = lines.map((line) => priceLine(line, rows.get(line.slug)));

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
  db: NodePgDatabase<typeof schema>,
  lines: readonly OrderAdjustmentLine[],
  tierId: string | null,
): Promise<Map<string, ProductRow>> {
  const slugs = [...new Set(lines.map((line) => line.slug))];
  if (slugs.length === 0) return new Map();

  // No visibility filter: staff see the catalog whole, and an order's own line
  // may point at a product the storefront stopped offering long ago.
  const rows = await db
    .select({
      id: products.id,
      slug: products.slug,
      name: products.name,
      sourceId: products.sourceId,
      priceMinor: resolvedPriceMinor(tierId),
      images: products.images,
      boxVolume: products.boxVolume,
      boxWeight: products.boxWeight,
      boxCount: products.boxCount,
      availability: products.availability,
      publishedAt: products.publishedAt,
      deletedAt: products.deletedAt,
      ...unitColumns,
    })
    .from(products)
    .where(inArray(products.slug, slugs));

  const found = new Map(rows.map((row) => [row.slug, row]));
  for (const slug of slugs) {
    if (found.has(slug)) continue;
    // Its own refusal rather than a marked line: staff may add anything the
    // catalog holds, so a slug nothing answers to is a request built against a
    // different catalog, not a product somebody withdrew.
    throw new BadRequestException({
      code: 'unknown-product',
      message: `No product is called ${slug}`,
    });
  }
  return found;
}

function priceLine(
  line: OrderAdjustmentLine,
  product?: ProductRow,
): PricedAdjustmentLine {
  // `loadProducts` refuses a slug it cannot resolve; this narrows the type.
  if (!product) throw new Error('an unresolved line reached the pricer');

  const packaging = packagingOf(product);
  // The line's own price, or the list's. A product no list prices can still be
  // put on an order — staff name the price — but nothing can invent one for it.
  const priceMinor = line.priceMinor ?? product.priceMinor;
  if (priceMinor === null) {
    throw new BadRequestException({
      code: 'product-has-no-price',
      message: `${product.slug} has no price in any list; give the line a price`,
    });
  }
  const pieces = line.pieces;
  const lineTotalMinor = totalMinor(priceMinor, pieces);

  // The lens only. A product repacked out of the unit this line was read in is
  // still perfectly orderable, so it falls back to the one unit every product
  // has; a line staff added has been read in no other unit yet.
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
    thumbnail: product.images[0]?.thumb ?? null,
    unit,
    pieces,
    quantity: unitQuantity(packaging, unit, pieces) ?? pieces,
    priceMinor,
    lineTotalMinor,
    note: line.note,
    flags,
    listPriceMinor: product.priceMinor,
  };
}
