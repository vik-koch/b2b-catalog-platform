import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { and, asc, eq, inArray, notInArray } from 'drizzle-orm';
import {
  parseAttributeNumber,
  ProductAttribute,
  splitAttributeKey,
  productAvailability,
} from '@b2b-catalog-platform/shared/core/catalog';
import {
  AdminProduct,
  LinkedDocument,
  LinkedProduct,
  ProductInput,
  ProductTierPrice,
} from '@b2b-catalog-platform/shared/admin/catalog';
import { sanitizeProductRichText } from '@b2b-catalog-platform/shared/node';
import { DRIZZLE } from '../../../db/database.module';
import * as schema from '../../../db/schema';
import {
  customerTiers,
  documentProducts,
  documents,
  productAttributes,
  productPairings,
  productPrices,
  products,
} from '../../../db/schema';
import { excluded } from '../../../db/sql-columns';
import { SettingsService } from '../../../settings/settings.service';
import { catalogExternallyOwned } from '../../../settings/ownership.refusals';
import { changedProductFields } from '../owned-fields';
import {
  counterpartOf,
  involves,
} from '../../../core/catalog/product-pairings';
import { defaultTierId } from './default-tier';
import { LOW_STOCK_THRESHOLD_PIECES } from '../../../config/deployment-config';
import {
  resolveNewSlug,
  resolveNewProductSourceId,
  resolveSlugOverride,
  resolveProductSourceIdOverride,
  runUnique,
} from '../catalog-identity';
import { assertCategoryExists } from '../categories/categories.service';
import {
  adminProductWriteColumns,
  linkedProductColumns,
  ProductRecords,
  productNotFound,
  ProductRow,
  StoredAttribute,
  toAdminProduct,
  toLinkedProduct,
} from './product-records';

/** What a save links to, resolved before it is written. */
interface SaveLinks {
  paired: (LinkedProduct & { id: string })[];
  linked: LinkedDocument[];
}

/** Creating and saving a product (FR-ADM-01), its lists in the same
 * transaction. */
@Injectable()
export class ProductEditorService {
  constructor(
    @Inject(DRIZZLE) private db: NodePgDatabase<typeof schema>,
    // The deployment's "few left" fallback.
    @Inject(LOW_STOCK_THRESHOLD_PIECES) private lowStockFallback: number,
    private readonly settings: SettingsService,
    private readonly records: ProductRecords,
  ) {}

  /** Whether the exchange owns the catalog (FR-ADM-10); a cached read. */
  private get catalogIsOwned(): boolean {
    return this.settings.isExternallyOwned('catalog');
  }

  async createProduct(
    input: ProductInput,
    actorId: string,
  ): Promise<AdminProduct> {
    // A create writes every owned field, so while the exchange owns the
    // catalog there is nothing to allow through.
    if (this.catalogIsOwned) throw catalogExternallyOwned('create');
    await assertCategoryExists(this.db, input.categoryId);
    const slug = await resolveNewSlug(
      this.db,
      products,
      input.slug,
      input.name,
      'product',
    );
    const sourceId = await resolveNewProductSourceId(this.db, input.sourceId);

    const links = await this.resolveLinks(input);

    // One transaction: the row and its lists are one edit.
    return this.db.transaction(async (tx) => {
      const [row] = await runUnique(() =>
        tx
          .insert(products)
          .values({ sourceId, slug, ...this.contentValues(input, actorId) })
          .returning(adminProductWriteColumns),
      );
      return this.writeLists(tx, row, input, links);
    });
  }

  async updateProduct(
    slug: string,
    input: ProductInput,
    actorId: string,
  ): Promise<AdminProduct> {
    const existing = await this.records.productBySlug(slug);
    if (!existing) throw productNotFound();
    if (this.catalogIsOwned) {
      const moved = changedProductFields(
        {
          ...existing,
          tierPrices: await this.records.tierPricesFor(existing.id),
        },
        input,
      );
      if (moved.length) throw catalogExternallyOwned(moved.join(', '));
    }
    await assertCategoryExists(this.db, input.categoryId);

    const newSlug = await resolveSlugOverride(
      this.db,
      products,
      input.slug,
      existing.slug,
    );
    const newSourceId = await resolveProductSourceIdOverride(
      this.db,
      input.sourceId,
      existing.sourceId,
    );

    const links = await this.resolveLinks(input, existing.id);

    return this.db.transaction(async (tx) => {
      const [row] = await runUnique(() =>
        tx
          .update(products)
          .set({
            slug: newSlug,
            sourceId: newSourceId,
            ...this.contentValues(input, actorId),
            updatedAt: new Date(),
            // Clearing the price takes the product off the storefront; the
            // editor says so on the button before it is pressed.
            ...(input.priceMinor === null
              ? { publishedAt: null, publishedBy: null }
              : {}),
          })
          .where(eq(products.id, existing.id))
          .returning(adminProductWriteColumns),
      );
      return this.writeLists(tx, row, input, links);
    });
  }

  /**
   * What a save links to, resolved before the transaction opens so an unknown
   * tier, counterpart or document is a 404 naming it rather than a foreign-key
   * error. `ownId` is the product being saved.
   */
  private async resolveLinks(
    input: ProductInput,
    ownId?: string,
  ): Promise<SaveLinks> {
    await this.ensureTiersExist(input.tierPrices);
    return {
      paired: await this.pairedProducts(input.pairedSlugs, ownId),
      linked: await this.linkedDocuments(input.documentIds),
    };
  }

  /** The row's columns create and update both write from the editor. */
  private contentValues(input: ProductInput, actorId: string) {
    return {
      name: input.name,
      categoryId: input.categoryId,
      // The single write path, so nothing reaches the column unsanitized.
      descriptionHtml: sanitizeProductRichText(input.descriptionHtml),
      images: input.images,
      variants: input.variants,
      featured: input.featured,
      lineNoteEnabled: input.lineNoteEnabled,
      lineNotePrompt: input.lineNotePrompt,
      parts: input.parts,
      updatedBy: actorId,
      ...packagingValues(input),
      ...this.stockValues(input),
      taxRate: input.taxRate,
    };
  }

  /**
   * The lists beside the row, each replaced by what the save posted, and the
   * product as the save leaves it.
   */
  private async writeLists(
    tx: NodePgDatabase<typeof schema>,
    row: Omit<ProductRow, 'priceMinor'>,
    input: ProductInput,
    { paired, linked }: SaveLinks,
  ): Promise<AdminProduct> {
    const defaultTier = await defaultTierId(tx);
    await this.writeDefaultPrice(tx, row.id, defaultTier, input.priceMinor);
    await this.replaceTierPrices(tx, row.id, defaultTier, input.tierPrices);
    const attributes = storedAttributes(input.attributes, input.parts);
    await this.replaceAttributes(tx, row.id, attributes);
    await this.replacePairings(
      tx,
      row.id,
      paired.map((p) => p.id),
    );
    await this.replaceDocumentLinks(tx, row.id, linked);
    return toAdminProduct(
      { ...row, priceMinor: input.priceMinor },
      input.tierPrices,
      attributes,
      namedPairings(paired),
      linked,
    );
  }

  /**
   * The stock figures and the state they resolve to, in one statement:
   * packaging arrives in the same save and moves the threshold, and
   * `returning` then hands back the badge the save caused.
   */
  private stockValues(input: ProductInput) {
    return {
      stockPieces: input.stockPieces,
      lowStockThresholdPieces: input.lowStockThresholdPieces,
      availability: productAvailability(
        input.stockPieces,
        input,
        input.lowStockThresholdPieces,
        this.lowStockFallback,
      ),
    };
  }

  /**
   * The default list's price, the editor's own price field. Null deletes it:
   * an unpriced product is a state the catalog holds, refused only by
   * publication.
   */
  private async writeDefaultPrice(
    tx: NodePgDatabase<typeof schema>,
    productId: string,
    tierId: string,
    priceMinor: number | null,
  ): Promise<void> {
    if (priceMinor === null) {
      await tx
        .delete(productPrices)
        .where(
          and(
            eq(productPrices.productId, productId),
            eq(productPrices.tierId, tierId),
          ),
        );
      return;
    }
    await tx
      .insert(productPrices)
      .values({ productId, tierId, priceMinor })
      .onConflictDoUpdate({
        target: [productPrices.productId, productPrices.tierId],
        set: { priceMinor, updatedAt: new Date() },
      });
  }

  /**
   * The other lists' prices: what the post leaves out is deleted, returning
   * that tier to the default price. The default list's row is never swept;
   * `writeDefaultPrice` answers for it.
   */
  private async replaceTierPrices(
    tx: NodePgDatabase<typeof schema>,
    productId: string,
    defaultTier: string,
    entries: ProductTierPrice[],
  ): Promise<void> {
    const keep = [...entries.map((e) => e.tierId), defaultTier];
    await tx
      .delete(productPrices)
      .where(
        and(
          eq(productPrices.productId, productId),
          notInArray(productPrices.tierId, keep),
        ),
      );
    if (entries.length === 0) return;

    await tx
      .insert(productPrices)
      .values(
        entries.map((e) => ({
          productId,
          tierId: e.tierId,
          priceMinor: e.priceMinor,
        })),
      )
      .onConflictDoUpdate({
        target: [productPrices.productId, productPrices.tierId],
        set: {
          priceMinor: excluded(productPrices.priceMinor),
          updatedAt: new Date(),
        },
      });
  }

  /**
   * The attributes, replaced wholesale rather than diffed, so a reorder is no
   * special case. `valueNumeric` is parsed for every value that reads as a
   * number, whether or not a definition claims the key.
   */
  private async replaceAttributes(
    tx: NodePgDatabase<typeof schema>,
    productId: string,
    entries: StoredAttribute[],
  ): Promise<void> {
    await tx
      .delete(productAttributes)
      .where(eq(productAttributes.productId, productId));
    if (entries.length === 0) return;

    await tx.insert(productAttributes).values(
      entries.map((entry, index) => {
        const numeric = parseAttributeNumber(entry.value);
        return {
          productId,
          sortOrder: index,
          key: entry.key,
          part: entry.part,
          value: entry.value,
          valueNumeric: numeric === null ? null : String(numeric),
        };
      }),
    );
  }

  /**
   * The counterparts a save named. Soft-deleted ones resolve like any other,
   * or keeping one would drop it; pairing a product with itself is refused
   * rather than dropped, so the editor says what it did not do.
   */
  private async pairedProducts(
    slugs: string[],
    ownId?: string,
  ): Promise<(LinkedProduct & { id: string })[]> {
    if (slugs.length === 0) return [];
    const rows = await this.db
      .select({ id: products.id, ...linkedProductColumns })
      .from(products)
      .where(inArray(products.slug, slugs))
      .orderBy(asc(products.name));
    if (rows.length !== new Set(slugs).size) {
      throw new NotFoundException({
        code: 'paired-product-not-found',
        message: 'Paired product not found',
      });
    }
    if (ownId !== undefined && rows.some((row) => row.id === ownId)) {
      throw new ConflictException({
        code: 'pairing-self',
        message: 'A product cannot be paired with itself',
      });
    }
    return rows.map((row) => ({ id: row.id, ...toLinkedProduct(row) }));
  }

  /** The documents a save named, returned named for the save's answer. */
  private async linkedDocuments(ids: string[]): Promise<LinkedDocument[]> {
    if (ids.length === 0) return [];
    const rows = await this.db
      .select({
        id: documents.id,
        title: documents.title,
        expiresAt: documents.expiresAt,
      })
      .from(documents)
      .where(inArray(documents.id, ids))
      .orderBy(asc(documents.expiresAt), asc(documents.title));
    if (rows.length !== new Set(ids).size) {
      throw new NotFoundException({
        code: 'document-not-found',
        message: 'Document not found',
      });
    }
    return rows;
  }

  /** This product's document links, from its side only: every other product
   * a document is on keeps it. */
  private async replaceDocumentLinks(
    tx: NodePgDatabase<typeof schema>,
    productId: string,
    linked: LinkedDocument[],
  ): Promise<void> {
    const documentIds = linked.map((d) => d.id);
    await tx
      .delete(documentProducts)
      .where(
        and(
          eq(documentProducts.productId, productId),
          documentIds.length > 0
            ? notInArray(documentProducts.documentId, documentIds)
            : undefined,
        ),
      );
    if (documentIds.length === 0) return;

    await tx
      .insert(documentProducts)
      .values(documentIds.map((documentId) => ({ documentId, productId })))
      .onConflictDoNothing();
  }

  /**
   * The pairings, from this product's side; one dropped here is dropped from
   * the counterpart too, as one edge is one row. Kept edges are left alone, so
   * a save does not re-date them.
   */
  private async replacePairings(
    tx: NodePgDatabase<typeof schema>,
    productId: string,
    counterpartIds: string[],
  ): Promise<void> {
    const counterpartId = counterpartOf(productId);
    await tx
      .delete(productPairings)
      .where(
        and(
          involves(productId),
          counterpartIds.length > 0
            ? notInArray(counterpartId, counterpartIds)
            : undefined,
        ),
      );
    if (counterpartIds.length === 0) return;

    await tx
      .insert(productPairings)
      .values(counterpartIds.map((other) => canonicalPair(productId, other)))
      .onConflictDoNothing();
  }

  private async ensureTiersExist(entries: ProductTierPrice[]): Promise<void> {
    if (entries.length === 0) return;
    const ids = [...new Set(entries.map((e) => e.tierId))];
    const rows = await this.db
      .select({ id: customerTiers.id })
      .from(customerTiers)
      .where(inArray(customerTiers.id, ids));
    if (rows.length !== ids.length) {
      throw new NotFoundException({
        code: 'tier-not-found',
        message: 'Customer tier not found',
      });
    }
  }
}

/**
 * The attributes a product keeps. A row with no key or value states nothing,
 * and the key picker adds empty rows on purpose, so they are dropped, not
 * refused.
 */
function storedAttributes(
  entries: ProductAttribute[],
  parts: readonly string[],
): StoredAttribute[] {
  // Both sides arrive trimmed from the contract.
  return entries
    .filter((entry) => entry.key !== '' && entry.value !== '')
    .map((entry) => ({
      ...splitAttributeKey(entry.key, parts),
      value: entry.value,
    }));
}

/** The counterparts without the id the write needed: the output schema is
 * strict, so an extra field would be a 500. */
function namedPairings(
  resolved: (LinkedProduct & { id: string })[],
): LinkedProduct[] {
  return resolved.map(({ slug, name, deleted, unpublished }) => ({
    slug,
    name,
    deleted,
    unpublished,
  }));
}

/** An edge as stored, the smaller id on the A side, so one pairing is one
 * row whichever product was edited. */
function canonicalPair(
  one: string,
  other: string,
): { productAId: string; productBId: string } {
  return one < other
    ? { productAId: one, productBId: other }
    : { productAId: other, productBId: one };
}

/** The packaging columns as create and update both write them. */
function packagingValues(input: ProductInput) {
  return {
    piecesPerPack: input.piecesPerPack,
    packsPerBox: input.packsPerBox,
    minPieceQty: input.minPieceQty,
    boxVolume: input.boxVolume,
    boxWeight: input.boxWeight,
    boxCount: input.boxCount,
  };
}
