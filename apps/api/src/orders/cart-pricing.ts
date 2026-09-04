import { and, inArray } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import {
  CartLine,
  CartLineIssue,
  CartPreview,
  CartPreviewLine,
  ProductAvailability,
  correctPieces,
  exactLineTotal,
  piecesPerUnit,
  ShipmentLineInput,
  shipmentEstimate,
  unitQuantity,
} from '@b2b-catalog-platform/shared';
import * as schema from '../db/schema';
import { products } from '../db/schema';
import { resolvedPriceMinor } from '../catalog/product-price';
import {
  availabilityColumns,
  packagingOf,
  publiclyVisible,
  unitColumns,
  unitPricesOf,
} from '../catalog/product-view';
import { pairedCountOf } from '../catalog/product-pairings';

/**
 * Pricing a cart, once, for both the preview and the submission — a submitted
 * order priced by a second code path is an order priced differently from the
 * one the customer saw.
 *
 * A cart is stale by construction: it sits in a browser for weeks while the
 * catalog moves under it. So every call re-reads the products through
 * `publiclyVisible` and re-derives every total; nothing here trusts what a
 * previous preview returned, and nothing here mutates the caller's cart.
 */

/** The stored figures a submitted line needs, beside what the preview shows.
 * They never reach the response — the contract is what withholds them. */
export interface PricedLineRow {
  productId: string;
  sourceId: string;
  priceMinor: number;
  priceBasisPieces: number;
  pieces: number;
  /** `pieces` read through the line's unit — the display snapshot an order
   * line freezes, worked out here because this is where the packaging is. */
  quantity: number;
  thumbnail: string | null;
}

export interface PricedLine {
  preview: CartPreviewLine;
  /** Null wherever the line cannot become an order line. */
  row: PricedLineRow | null;
}

export interface PricedCart {
  preview: CartPreview;
  lines: PricedLine[];
}

/**
 * The visible half of a product row. Everything else the pricer reads
 * (`sourceId`, the price basis) stays inside `PricedLineRow`.
 */
type ProductRow = {
  id: string;
  slug: string;
  name: string;
  sourceId: string;
  priceMinor: number;
  images: schema.ProductImageRef[];
  boxVolume: string | null;
  boxWeight: string | null;
  boxCount: number;
  lineNoteEnabled: boolean;
  lineNotePrompt: string | null;
  /** The stored state, never the count behind it (FR-STOCK-01). */
  availability: ProductAvailability | null;
  /** How many sellable products this one is sold together with (FR-SET-05). */
  pairedCount: number;
  priceBasisPieces: number;
  piecesPerPack: number | null;
  packsPerBox: number | null;
  minPieceQty: number;
};

export async function priceCart(
  db: NodePgDatabase<typeof schema>,
  lines: readonly CartLine[],
  tierId: string | null,
): Promise<PricedCart> {
  const rows = await loadProducts(db, lines, tierId);
  const priced = lines.map((line) => priceLine(line, rows.get(line.slug)));

  const shipmentLines: ShipmentLineInput[] = [];
  for (const { preview, row } of priced) {
    const product = rows.get(preview.slug);
    // Only a line that is actually orderable ships anything.
    if (!product || !row) continue;
    shipmentLines.push({
      packaging: packagingOf(product),
      pieces: preview.pieces,
      boxVolume: product.boxVolume,
      boxWeight: product.boxWeight,
      boxCount: product.boxCount,
    });
  }

  const totals = priced.reduce(
    (sum, { preview }) => sum + (preview.lineTotalMinor ?? 0),
    0,
  );

  return {
    lines: priced,
    preview: {
      lines: priced.map(({ preview }) => preview),
      totalMinor: totals,
      // False as soon as one line has no price: a partial sum must never be
      // read as the cart's total.
      complete: priced.every(({ preview }) => preview.lineTotalMinor !== null),
      shipment: shipmentEstimate(shipmentLines),
    },
  };
}

async function loadProducts(
  db: NodePgDatabase<typeof schema>,
  lines: readonly CartLine[],
  tierId: string | null,
): Promise<Map<string, ProductRow>> {
  const slugs = [...new Set(lines.map((line) => line.slug))];
  if (slugs.length === 0) return new Map();

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
      lineNoteEnabled: products.lineNoteEnabled,
      lineNotePrompt: products.lineNotePrompt,
      ...availabilityColumns,
      ...unitColumns,
      pairedCount: pairedCountOf(),
    })
    .from(products)
    .where(and(inArray(products.slug, slugs), publiclyVisible));

  return new Map(rows.map((row) => [row.slug, row]));
}

function priceLine(line: CartLine, product?: ProductRow): PricedLine {
  const note = line.note ?? null;
  const issues: CartLineIssue[] = [];

  // One code for soft-deleted, unpublished and never-existed alike: telling
  // them apart would make this endpoint an oracle that enumerates the
  // unpublished catalog by difference.
  if (!product) {
    return {
      row: null,
      preview: {
        slug: line.slug,
        unit: line.unit,
        pieces: line.pieces,
        note,
        name: null,
        image: null,
        packaging: null,
        prices: null,
        availability: null,
        boxVolume: null,
        boxWeight: null,
        boxCount: null,
        pairedCount: 0,
        lineNoteEnabled: false,
        lineNotePrompt: null,
        lineTotalMinor: null,
        issues: ['unavailable'],
      },
    };
  }

  const packaging = packagingOf(product);
  const prices = unitPricesOf(product);
  const image = product.images[0] ?? null;

  // A note on a product that no longer takes one is dropped here rather than
  // refused — the policy can be turned off after the note was written, and the
  // rest of the line is still perfectly orderable. It is an advisory, so a
  // *submission* carrying it still 409s like any other issue, with this
  // stripped cart in the answer: the customer sees the note go before the order
  // is placed without it.
  const keptNote = product.lineNoteEnabled ? note : null;
  if (note !== null && !product.lineNoteEnabled)
    issues.push('note-not-allowed');

  // The quantity is in pieces and is corrected against the piece rules, which
  // are the only rules there are: a line stored when the minimum was six must
  // be corrected before it is priced, or it is priced against a basis it no
  // longer divides.
  const pieces = correctPieces(packaging, line.pieces);
  if (pieces !== line.pieces) issues.push('quantity-corrected');

  // The lens, not the quantity: a product repacked out of the unit this line
  // was being read in is still perfectly orderable — the pieces are untouched
  // — so it falls back to the one unit every product has and says it did.
  const sold = piecesPerUnit(packaging, line.unit) !== null;
  const unit = sold ? line.unit : 'piece';
  if (!sold) issues.push('unit-unavailable');

  const lineTotalMinor = exactLineTotal(prices, packaging, pieces);
  if (lineTotalMinor === null) issues.push('price-unavailable');

  // The line stays exactly as it is — named, priced and orderable in every
  // other respect (FR-STOCK-04). What the issue does is refuse the *order*:
  // submission takes any issue as a refusal, so nothing more is needed to stop
  // an empty shelf being sold. "Few left" restricts nothing.
  if (product.availability === 'out') issues.push('out-of-stock');

  return {
    row:
      lineTotalMinor === null
        ? null
        : {
            productId: product.id,
            sourceId: product.sourceId,
            priceMinor: product.priceMinor,
            priceBasisPieces: product.priceBasisPieces,
            pieces,
            // Never null: `unit` has already fallen back to one the product is
            // sold in.
            quantity: unitQuantity(packaging, unit, pieces) ?? pieces,
            thumbnail: image?.thumb ?? null,
          },
    preview: {
      slug: product.slug,
      unit,
      pieces,
      note: keptNote,
      name: product.name,
      image,
      packaging,
      prices,
      availability: product.availability,
      pairedCount: product.pairedCount,
      boxVolume: product.boxVolume,
      boxWeight: product.boxWeight,
      boxCount: product.boxCount,
      lineNoteEnabled: product.lineNoteEnabled,
      lineNotePrompt: product.lineNotePrompt,
      lineTotalMinor,
      issues,
    },
  };
}
