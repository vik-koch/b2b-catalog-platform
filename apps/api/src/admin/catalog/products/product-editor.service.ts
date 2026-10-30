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
  ProductRecords,
  productNotFound,
  StoredAttribute,
  toAdminProduct,
} from './product-records';

/**
 * Creating and saving a product (FR-ADM-01). Descriptions are sanitized here,
 * the single write path, so nothing reaches the column unsanitized; the lists
 * beside the row are replaced in the same transaction.
 */
@Injectable()
export class ProductEditorService {
  constructor(
    @Inject(DRIZZLE) private db: NodePgDatabase<typeof schema>,
    // The last rung of the "few left" ladder, injected the way every other
    // deployment rule is — a spec hands over a figure without a config file.
    @Inject(LOW_STOCK_THRESHOLD_PIECES) private lowStockFallback: number,
    private readonly settings: SettingsService,
    private readonly records: ProductRecords,
  ) {}

  /**
   * Whether the exchange currently holds the pen (FR-ADM-10). A cached
   * synchronous read, so asking it on every write costs nothing.
   */
  private get catalogIsOwned(): boolean {
    return this.settings.isExternallyOwned('catalog');
  }

  async createProduct(
    input: ProductInput,
    actorId: string,
  ): Promise<AdminProduct> {
    // A create writes every owned field at once — identity included — so there
    // is nothing to compare and nothing to allow through. While the exchange
    // owns the catalog, what exists in it is the exchange's to say.
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

    await this.ensureTiersExist(input.tierPrices);
    const paired = await this.pairedProducts(input.pairedSlugs);
    const linked = await this.linkedDocuments(input.documentIds);

    // One transaction, because a product and its tier prices are one edit: a
    // half-applied save would leave a price on the wrong product's row set.
    return this.db.transaction(async (tx) => {
      const row = await runUnique(() =>
        tx
          .insert(products)
          .values({
            sourceId,
            slug,
            name: input.name,
            categoryId: input.categoryId,
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
          })
          .returning(adminProductWriteColumns),
      );
      await this.writeDefaultPrice(tx, row[0].id, input.priceMinor);
      await this.replaceTierPrices(tx, row[0].id, input.tierPrices);
      const attributes = storedAttributes(input.attributes, input.parts);
      await this.replaceAttributes(tx, row[0].id, attributes);
      await this.replacePairings(
        tx,
        row[0].id,
        paired.map((p) => p.id),
      );
      await this.replaceDocumentLinks(tx, row[0].id, linked);
      return toAdminProduct(
        { ...row[0], priceMinor: input.priceMinor },
        input.tierPrices,
        attributes,
        namedPairings(paired),
        linked,
      );
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

    await this.ensureTiersExist(input.tierPrices);
    const paired = await this.pairedProducts(input.pairedSlugs, existing.id);
    const linked = await this.linkedDocuments(input.documentIds);

    return this.db.transaction(async (tx) => {
      const row = await runUnique(() =>
        tx
          .update(products)
          .set({
            slug: newSlug,
            name: input.name,
            categoryId: input.categoryId,
            descriptionHtml: sanitizeProductRichText(input.descriptionHtml),
            images: input.images,
            variants: input.variants,
            featured: input.featured,
            lineNoteEnabled: input.lineNoteEnabled,
            lineNotePrompt: input.lineNotePrompt,
            parts: input.parts,
            sourceId: newSourceId,
            updatedAt: new Date(),
            updatedBy: actorId,
            // Clearing the price takes the product off the storefront: a page
            // cannot show a visitor a price that does not exist. The editor
            // says so on the button before it is pressed, so this is the save
            // the admin asked for rather than a refusal they have to undo.
            ...(input.priceMinor === null
              ? { publishedAt: null, publishedBy: null }
              : {}),
            ...packagingValues(input),
            ...this.stockValues(input),
            taxRate: input.taxRate,
          })
          .where(eq(products.id, existing.id))
          .returning(adminProductWriteColumns),
      );
      await this.writeDefaultPrice(tx, existing.id, input.priceMinor);
      await this.replaceTierPrices(tx, existing.id, input.tierPrices);
      const attributes = storedAttributes(input.attributes, input.parts);
      await this.replaceAttributes(tx, existing.id, attributes);
      await this.replacePairings(
        tx,
        existing.id,
        paired.map((p) => p.id),
      );
      await this.replaceDocumentLinks(tx, existing.id, linked);
      return toAdminProduct(
        { ...row[0], priceMinor: input.priceMinor },
        input.tierPrices,
        attributes,
        namedPairings(paired),
        linked,
      );
    });
  }

  /**
   * The stock columns as create and update both write them — the state
   * alongside the figures it comes from, in one statement.
   *
   * Recomputed here rather than in the database because packaging is part of
   * the answer and arrives in the same save: a threshold that follows the box
   * moves whenever the box does. Writing the state with the figures is also
   * what makes the response honest — `returning` hands back the row that was
   * stored, so the editor reads back the badge it just caused rather than the
   * one from before the save.
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
   * The default list's price for one product — the editor's own price field.
   * Written apart from the other lists because the editor offers it apart, and
   * null deletes it: a product nothing prices is a state the catalog holds
   * rather than an error, and only publication refuses it.
   */
  private async writeDefaultPrice(
    tx: NodePgDatabase<typeof schema>,
    productId: string,
    priceMinor: number | null,
  ): Promise<void> {
    const tierId = await defaultTierId(tx);
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
   * The single write path for the non-default lists. The posted list is the
   * whole truth: what is missing from it is deleted, so removing a product's
   * price in the editor returns that tier to the default list's.
   *
   * The default list's own row is never swept — it is not in the posted list
   * because the editor keeps it in a field of its own, and `writeDefaultPrice`
   * is what answers for it.
   */
  private async replaceTierPrices(
    tx: NodePgDatabase<typeof schema>,
    productId: string,
    entries: ProductTierPrice[],
  ): Promise<void> {
    const keep = [...entries.map((e) => e.tierId), await defaultTierId(tx)];
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
   * The single write path for attributes, and the same rule as tier prices: the
   * posted list is the whole truth. Replaced wholesale rather than diffed, so a
   * reorder is not a special case, and inside the product's transaction, so a
   * failed save cannot leave half a grid behind.
   *
   * `valueNumeric` is parsed here for every value that reads as a number,
   * whether or not a definition claims the key.
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
   * The counterparts a save named, resolved before the transaction opens so an
   * unknown slug is a 404 naming the product rather than a foreign-key error.
   *
   * Soft-deleted counterparts resolve like any other: the editor lists them
   * marked, and a save that keeps them must not be the thing that drops them.
   * `ownId` is the product being saved — pairing it with itself is refused
   * rather than silently dropped, so the editor says what it did not do.
   */
  private async pairedProducts(
    slugs: string[],
    ownId?: string,
  ): Promise<(LinkedProduct & { id: string })[]> {
    if (slugs.length === 0) return [];
    const rows = await this.db
      .select({
        id: products.id,
        slug: products.slug,
        name: products.name,
        deletedAt: products.deletedAt,
        publishedAt: products.publishedAt,
      })
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
    return rows.map((row) => ({
      id: row.id,
      slug: row.slug,
      name: row.name,
      deleted: row.deletedAt !== null,
      unpublished: row.publishedAt === null,
    }));
  }

  /**
   * The documents a save named, resolved before the transaction opens so an
   * unknown id is a 404 rather than a foreign-key error — and returned named,
   * because the answer this save writes carries them back.
   */
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

  /**
   * The single write path for this product's document links — the posted list
   * is the whole truth *from this product's side*. Removing a document here
   * removes it from this product only; every other product it is shown on
   * keeps it, because a link names one pair.
   */
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
   * The single write path for pairings, and the same rule as tier prices: the
   * posted list is the whole truth, from this product's side. Removing a
   * counterpart here removes the pairing from that product too — there is one
   * row, and it says the two are sold together.
   *
   * Untouched edges are left where they are (`onConflictDoNothing`), so saving
   * a product does not re-date the pairings it kept.
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

  /**
   * A 404 rather than a foreign-key error: an unknown tier is the same class of
   * mistake as an unknown category, and the editor renders that message.
   */
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
 * The attributes a product actually keeps. A row with no value states nothing:
 * it would print a dangling label on the product page and turn up as a nameless
 * checkbox in that attribute's filter. The grid produces them on purpose — the
 * key picker adds a row per name picked — so they are dropped, not refused, the
 * same way a row with no key is.
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

/**
 * The counterparts as the contract serializes them. The resolved rows carry the
 * id the write needs, and the output schema is strict — an extra field is a 500
 * rather than a wrong answer, which is how this was caught.
 */
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

/**
 * An edge's two columns, ordered as the table stores them: the smaller id is
 * always the A side, which is what makes one pairing one row whichever of the
 * two products was being edited.
 */
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
