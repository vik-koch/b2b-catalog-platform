import { and, inArray } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import {
  CartLine,
  CartLineIssue,
  CartPreview,
  CartPreviewLine,
  ShipmentLineInput,
  shipmentEstimate,
} from '@b2b-catalog-platform/shared/core/ordering';
import {
  effectiveTaxRate,
  TaxConfig,
} from '@b2b-catalog-platform/shared/platform';
import {
  ProductAvailability,
  correctPieces,
  exactLineTotal,
  piecesPerUnit,
  unitQuantity,
} from '@b2b-catalog-platform/shared/core/catalog';
import { pairingShortfalls } from './pairing-check';
import * as schema from '../../platform/db/schema';
import { products } from '../../platform/db/schema';
import { livePriceMinor } from '../catalog/product-price';
import {
  listItemColumns,
  packagingOf,
  picturesOf,
  publiclyVisible,
  unitPricesOf,
} from '../catalog/product-view';
import { pairingsAmong } from '../catalog/product-pairings';

/**
 * Pricing a cart, once, for the preview and the submission alike. A cart is
 * stale by construction, so every call re-reads products through
 * `publiclyVisible` and never mutates the caller's cart.
 */

/** The figures an order line stores, which the contract keeps off the wire. */
export interface PricedLineRow {
  productId: string;
  sourceId: string;
  priceMinor: number;
  pieces: number;
  /** The display snapshot an order line freezes. */
  quantity: number;
  thumbnail: string | null;
  /** The rate the line is taxed at, as the preview states it. */
  taxRate: number | null;
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

/** The product columns the pricer reads. */
type ProductRow = {
  id: string;
  slug: string;
  name: string;
  sourceId: string;
  priceMinor: number;
  images: schema.ProductImageRef[];
  variants: schema.ProductVariantRef[];
  boxVolume: string | null;
  boxWeight: string | null;
  boxCount: number;
  lineNoteEnabled: boolean;
  lineNotePrompt: string | null;
  /** The stored state, never the count behind it (FR-STOCK-01). */
  availability: ProductAvailability | null;
  /** How many sellable products this one is sold together with (FR-SET-05). */
  pairedCount: number;
  parts: string[];
  piecesPerPack: number | null;
  packsPerBox: number | null;
  minPieceQty: number;
  /** The product's own rate; null is the deployment's default. */
  taxRate: number | null;
};

export async function priceCart(
  db: NodePgDatabase<typeof schema>,
  lines: readonly CartLine[],
  tierId: string | null,
  tax: TaxConfig,
): Promise<PricedCart> {
  const rows = await loadProducts(db, lines, tierId);
  const priced = lines.map((line) => priceLine(line, tax, rows.get(line.slug)));

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

  await applyPairingShortfalls(db, priced, rows);

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

/**
 * What each line is short of what it is sold with (FR-SET-02/03), among the
 * lines still offered: one query for the edges between them.
 */
async function applyPairingShortfalls(
  db: NodePgDatabase<typeof schema>,
  priced: readonly PricedLine[],
  rows: ReadonlyMap<string, ProductRow>,
): Promise<void> {
  const offered = priced.filter((line) => rows.has(line.preview.slug));
  const byId = new Map(
    offered.map((line) => [
      (rows.get(line.preview.slug) as ProductRow).id,
      line.preview.slug,
    ]),
  );

  const counterparts = new Map<string, string[]>(
    offered.map((line) => [line.preview.slug, []]),
  );
  for (const [a, b] of await pairingsAmong(db, [...byId.keys()])) {
    const one = byId.get(a);
    const other = byId.get(b);
    // Undirected, so each end is the other's counterpart from the one row.
    if (one === undefined || other === undefined) continue;
    counterparts.get(one)?.push(other);
    counterparts.get(other)?.push(one);
  }

  const short = new Map(
    pairingShortfalls(
      offered.map(({ preview }) => ({
        slug: preview.slug,
        pieces: preview.pieces,
        // The sellable counterpart count: a cup whose only lid is unpublished
        // is not short of anything.
        paired: preview.pairedCount > 0,
        counterpartSlugs: counterparts.get(preview.slug) ?? [],
      })),
    ).map((one) => [one.slug, one.shortPieces]),
  );

  for (const { preview } of priced) {
    preview.pairingShortPieces = short.get(preview.slug) ?? null;
  }
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
      ...listItemColumns(livePriceMinor(tierId)),
      id: products.id,
      sourceId: products.sourceId,
      boxVolume: products.boxVolume,
      boxWeight: products.boxWeight,
      boxCount: products.boxCount,
      taxRate: products.taxRate,
    })
    .from(products)
    .where(and(inArray(products.slug, slugs), publiclyVisible));

  return new Map(rows.map((row) => [row.slug, row]));
}

function priceLine(
  line: CartLine,
  tax: TaxConfig,
  product?: ProductRow,
): PricedLine {
  const note = line.note ?? null;
  const issues: CartLineIssue[] = [];

  // One code for deleted, unpublished and never-existed: the endpoint must not
  // enumerate the unpublished catalog.
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
        variants: [],
        images: [],
        packaging: null,
        prices: null,
        availability: null,
        boxVolume: null,
        boxWeight: null,
        boxCount: null,
        pairedCount: 0,
        parts: [],
        pairingShortPieces: null,
        lineNoteEnabled: false,
        lineNotePrompt: null,
        lineTotalMinor: null,
        taxRate: null,
        issues: ['unavailable'],
      },
    };
  }

  const packaging = packagingOf(product);
  const prices = unitPricesOf(product);
  // The first picture shown, not stored (FR-CAT-12).
  const pictures = picturesOf(product);
  const first = pictures.images[0];
  const image = first ? { full: first.full, thumb: first.thumb } : null;

  // A note the product no longer takes is dropped and reported; a submission
  // still refuses on it, so the customer sees it go first.
  const keptNote = product.lineNoteEnabled ? note : null;
  if (note !== null && !product.lineNoteEnabled)
    issues.push('note-not-allowed');

  // Corrected against today's piece rules before pricing, or the price would
  // not divide.
  const pieces = correctPieces(packaging, line.pieces);
  if (pieces !== line.pieces) issues.push('quantity-corrected');

  // The unit falls back to the piece; the pieces stand.
  const sold = piecesPerUnit(packaging, line.unit) !== null;
  const unit = sold ? line.unit : 'piece';
  if (!sold) issues.push('unit-unavailable');

  const lineTotalMinor = exactLineTotal(prices.piece, pieces);
  if (lineTotalMinor === null) issues.push('price-unavailable');

  // The line stays as it is (FR-STOCK-04); the issue refuses the order. "Few
  // left" restricts nothing.
  if (product.availability === 'out') issues.push('out-of-stock');

  const taxRate = effectiveTaxRate(tax, product.taxRate);

  return {
    row:
      lineTotalMinor === null
        ? null
        : {
            productId: product.id,
            sourceId: product.sourceId,
            priceMinor: product.priceMinor,
            pieces,
            // Never null: `unit` has already fallen back to one the product is
            // sold in.
            quantity: unitQuantity(packaging, unit, pieces) ?? pieces,
            thumbnail: image?.thumb ?? null,
            taxRate,
          },
    preview: {
      slug: product.slug,
      unit,
      pieces,
      note: keptNote,
      name: product.name,
      image,
      ...pictures,
      packaging,
      prices,
      availability: product.availability,
      pairedCount: product.pairedCount,
      parts: product.parts,
      // Filled in once the whole cart is known: one line cannot answer it.
      pairingShortPieces: null,
      boxVolume: product.boxVolume,
      boxWeight: product.boxWeight,
      boxCount: product.boxCount,
      lineNoteEnabled: product.lineNoteEnabled,
      lineNotePrompt: product.lineNotePrompt,
      lineTotalMinor,
      taxRate,
      issues,
    },
  };
}
