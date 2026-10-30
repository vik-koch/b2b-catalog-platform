import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { and, asc, eq } from 'drizzle-orm';
import {
  joinAttributeKey,
  PartKey,
  ProductAvailability,
} from '@b2b-catalog-platform/shared/core/catalog';
import {
  AdminProduct,
  LinkedDocument,
  LinkedProduct,
  ProductTierPrice,
} from '@b2b-catalog-platform/shared/admin/catalog';
import { DRIZZLE } from '../../../db/database.module';
import * as schema from '../../../db/schema';
import {
  customerTiers,
  documentProducts,
  documents,
  productAttributes,
  productPairings,
  productPrices,
  ProductImageRef,
  products,
  ProductVariantRef,
} from '../../../db/schema';
import {
  counterpartOf,
  involves,
} from '../../../core/catalog/product-pairings';
import { resolvedPriceMinor } from '../../../core/catalog/product-price';

/**
 * A function rather than a constant so each throw gets its own stack; the code
 * — the only part a screen reads — never varies.
 */
export const productNotFound = () =>
  new NotFoundException({
    code: 'product-not-found',
    message: 'Product not found',
  });

/**
 * The editable product shape, minus the price. A write's `returning` uses this
 * one: the default list's price is a row in another table, written *after* the
 * product, so a subquery in `returning` would report the state before the save
 * rather than the one it just made.
 */
export const adminProductWriteColumns = {
  id: products.id,
  slug: products.slug,
  name: products.name,
  categoryId: products.categoryId,
  sourceId: products.sourceId,
  descriptionHtml: products.descriptionHtml,
  images: products.images,
  variants: products.variants,
  deletedAt: products.deletedAt,
  deletedBy: products.deletedBy,
  publishedAt: products.publishedAt,
  updatedAt: products.updatedAt,
  piecesPerPack: products.piecesPerPack,
  packsPerBox: products.packsPerBox,
  minPieceQty: products.minPieceQty,
  boxVolume: products.boxVolume,
  boxWeight: products.boxWeight,
  boxCount: products.boxCount,
  featured: products.featured,
  lineNoteEnabled: products.lineNoteEnabled,
  lineNotePrompt: products.lineNotePrompt,
  stockPieces: products.stockPieces,
  lowStockThresholdPieces: products.lowStockThresholdPieces,
  taxRate: products.taxRate,
  availability: products.availability,
  parts: products.parts,
} as const;

/** The same shape as a read sees it — the default list's price included. */
export const adminProductColumns = {
  ...adminProductWriteColumns,
  priceMinor: resolvedPriceMinor(null),
} as const;

export type ProductRow = {
  id: string;
  slug: string;
  name: string;
  priceMinor: number | null;
  categoryId: string;
  sourceId: string;
  descriptionHtml: string;
  images: ProductImageRef[];
  variants: ProductVariantRef[];
  deletedAt: Date | null;
  deletedBy: string | null;
  publishedAt: Date | null;
  updatedAt: Date;
  piecesPerPack: number | null;
  packsPerBox: number | null;
  minPieceQty: number;
  boxVolume: string | null;
  boxWeight: string | null;
  boxCount: number;
  featured: boolean;
  lineNoteEnabled: boolean;
  lineNotePrompt: string | null;
  stockPieces: number | null;
  lowStockThresholdPieces: number | null;
  taxRate: number | null;
  availability: ProductAvailability | null;
  parts: string[];
};

/**
 * An attribute row as stored: "Colour (cup)" on a product sold as a cup and a
 * lid is key "Colour", part "cup" (FR-CAT-10), so it filters as Colour. The
 * split is worked out again from the written key on every save, so dropping a
 * part turns its rows back into plain keys rather than leaving them pointing
 * at nothing.
 */
export type StoredAttribute = PartKey & { value: string };

/**
 * A product in its editable form (FR-ADM-01): the row and the four lists the
 * editor shows beside it. What every product route answers with, so a write
 * reads back exactly what a load would.
 */
@Injectable()
export class ProductRecords {
  constructor(@Inject(DRIZZLE) private db: NodePgDatabase<typeof schema>) {}

  /** Loads a product in editable form regardless of soft-delete state. */
  async get(slug: string): Promise<AdminProduct | null> {
    const row = await this.productBySlug(slug);
    return row ? this.assemble(row) : null;
  }

  /** A stored row with its four lists, read after the row was. */
  async assemble(row: ProductRow): Promise<AdminProduct> {
    return toAdminProduct(
      row,
      await this.tierPricesFor(row.id),
      await this.attributesFor(row.id),
      await this.pairingsFor(row.id),
      await this.documentsFor(row.id),
    );
  }

  async productBySlug(slug: string): Promise<ProductRow | undefined> {
    const [row] = await this.db
      .select(adminProductColumns)
      .from(products)
      .where(eq(products.slug, slug))
      .limit(1);
    return row;
  }

  /**
   * The prices stored for a product, without the default list's — the editor
   * carries that one in its own field, so an empty result means "this product
   * costs the same in every tier".
   */
  async tierPricesFor(productId: string): Promise<ProductTierPrice[]> {
    return this.db
      .select({
        tierId: productPrices.tierId,
        priceMinor: productPrices.priceMinor,
      })
      .from(productPrices)
      .innerJoin(customerTiers, eq(customerTiers.id, productPrices.tierId))
      .where(
        and(
          eq(productPrices.productId, productId),
          eq(customerTiers.isDefault, false),
        ),
      )
      .orderBy(asc(productPrices.tierId));
  }

  /**
   * A product's attributes in the grid's row order. `sortOrder` is data, so it
   * has to be asked for — array position no longer carries the order.
   */
  private async attributesFor(productId: string): Promise<StoredAttribute[]> {
    return this.db
      .select({
        key: productAttributes.key,
        part: productAttributes.part,
        value: productAttributes.value,
      })
      .from(productAttributes)
      .where(eq(productAttributes.productId, productId))
      .orderBy(asc(productAttributes.sortOrder));
  }

  /**
   * The products this one is sold together with (FR-SET-01), in name order —
   * the order the editor lists them in, and the only one an admin can predict.
   *
   * An edge is stored once, so a product's neighbours sit on whichever side it
   * is not: the `case` picks the other end, and the `or` is what makes the
   * table read the same from both products.
   */
  private async pairingsFor(productId: string): Promise<LinkedProduct[]> {
    const counterpartId = counterpartOf(productId);
    const rows = await this.db
      .select({
        slug: products.slug,
        name: products.name,
        deletedAt: products.deletedAt,
        publishedAt: products.publishedAt,
      })
      .from(productPairings)
      .innerJoin(products, eq(products.id, counterpartId))
      .where(involves(productId))
      .orderBy(asc(products.name));
    return rows.map((row) => ({
      slug: row.slug,
      name: row.name,
      deleted: row.deletedAt !== null,
      unpublished: row.publishedAt === null,
    }));
  }

  /**
   * The documents shown on one product (FR-DOC-02), soonest expiry first — the
   * order the document list uses, so the two screens agree about which one is
   * about to run out.
   */
  private async documentsFor(productId: string): Promise<LinkedDocument[]> {
    const rows = await this.db
      .select({
        id: documents.id,
        title: documents.title,
        expiresAt: documents.expiresAt,
      })
      .from(documentProducts)
      .innerJoin(documents, eq(documents.id, documentProducts.documentId))
      .where(eq(documentProducts.productId, productId))
      .orderBy(asc(documents.expiresAt), asc(documents.title));
    return rows;
  }
}

/**
 * A deletion nobody signed: a run's sweep writes no actor, a person's delete
 * always does (FR-ADM-10). Staff accounts are anonymized rather than removed,
 * so the foreign key's `set null` never turns a person's deletion into a run's.
 */
export function deletedByRun(row: {
  deletedAt: Date | null;
  deletedBy: string | null;
}): boolean {
  return row.deletedAt !== null && row.deletedBy === null;
}

export function toAdminProduct(
  row: ProductRow,
  tierPrices: ProductTierPrice[],
  attributes: StoredAttribute[],
  pairings: LinkedProduct[],
  documents: LinkedDocument[],
): AdminProduct {
  return {
    slug: row.slug,
    name: row.name,
    priceMinor: row.priceMinor,
    categoryId: row.categoryId,
    sourceId: row.sourceId,
    descriptionHtml: row.descriptionHtml,
    // Written back as the admin typed it, so a save round-trips unchanged.
    attributes: attributes.map((entry) => ({
      key: joinAttributeKey(entry),
      value: entry.value,
    })),
    parts: row.parts,
    // Pictures stored before variants existed carry no reference at all.
    images: row.images.map(({ full, thumb, variantId }) => ({
      full,
      thumb,
      variantId: variantId ?? null,
    })),
    variants: row.variants,
    tierPrices,
    pairings,
    documents,
    deletedAt: row.deletedAt?.toISOString() ?? null,
    deletedByRun: deletedByRun(row),
    publishedAt: row.publishedAt?.toISOString() ?? null,
    updatedAt: row.updatedAt.toISOString(),
    piecesPerPack: row.piecesPerPack,
    packsPerBox: row.packsPerBox,
    minPieceQty: row.minPieceQty,
    boxVolume: row.boxVolume,
    boxWeight: row.boxWeight,
    boxCount: row.boxCount,
    featured: row.featured,
    lineNoteEnabled: row.lineNoteEnabled,
    lineNotePrompt: row.lineNotePrompt,
    stockPieces: row.stockPieces,
    lowStockThresholdPieces: row.lowStockThresholdPieces,
    taxRate: row.taxRate,
    availability: row.availability,
  };
}
