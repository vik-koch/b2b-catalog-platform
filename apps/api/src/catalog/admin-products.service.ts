import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import {
  and,
  asc,
  count,
  eq,
  inArray,
  isNotNull,
  isNull,
  notInArray,
  or,
  sql,
} from 'drizzle-orm';
import {
  ADMIN_CATALOG_PAGE_SIZE,
  AdminProduct,
  AdminProductListItem,
  AdminProductListQuery,
  HiddenProduct,
  LinkedDocument,
  PairedProduct,
  parseAttributeNumber,
  ProductAttribute,
  productAvailability,
  ProductAvailability,
  ProductInput,
  ProductTierPrice,
} from '@b2b-catalog-platform/shared';
import { sanitizeProductRichText } from '@b2b-catalog-platform/shared/node';
import { DRIZZLE } from '../db/database.module';
import * as schema from '../db/schema';
import {
  categories,
  customerTiers,
  documentProducts,
  documents,
  productAttributes,
  productPairings,
  productPrices,
  products,
} from '../db/schema';
import { attributeFilterCondition } from './attribute-filter';
import { tierPriceCondition } from './tier-price-filter';
import { categoryBySlug, descendantIds } from './catalog-tree';
import {
  adminSearchCondition,
  parseSearchQuery,
  relevanceScore,
  setSearchThreshold,
} from './product-search';
import { adminProductOrderBy } from './product-sort';
import {
  availabilityColumns,
  noteColumns,
  toListItem,
  unitColumns,
} from './product-view';
import { counterpartOf, involves, pairedCountOf } from './product-pairings';
import { LOW_STOCK_THRESHOLD_PIECES } from '../config/deployment-config';
import {
  resolveNewSlug,
  resolveNewSourceId,
  resolveSlugOverride,
  resolveSourceIdOverride,
  runUnique,
} from './catalog-identity';
import {
  assertCategoryExists,
  categoryNotFound,
} from './admin-categories.service';

/**
 * A function rather than a constant so each throw gets its own stack; the code
 * — the only part a screen reads — never varies.
 */
const productNotFound = () =>
  new NotFoundException({
    code: 'product-not-found',
    message: 'Product not found',
  });

/** The editable product shape the admin contract returns. */
const adminProductColumns = {
  id: products.id,
  slug: products.slug,
  name: products.name,
  priceMinor: products.defaultPriceMinor,
  categoryId: products.categoryId,
  sourceId: products.sourceId,
  descriptionHtml: products.descriptionHtml,
  images: products.images,
  deletedAt: products.deletedAt,
  publishedAt: products.publishedAt,
  updatedAt: products.updatedAt,
  priceBasisPieces: products.priceBasisPieces,
  piecesPerPack: products.piecesPerPack,
  packsPerBox: products.packsPerBox,
  minPieceQty: products.minPieceQty,
  boxVolume: products.boxVolume,
  boxWeight: products.boxWeight,
  boxCount: products.boxCount,
  lineNoteEnabled: products.lineNoteEnabled,
  lineNotePrompt: products.lineNotePrompt,
  stockPieces: products.stockPieces,
  lowStockThresholdPieces: products.lowStockThresholdPieces,
  availability: products.availability,
} as const;

type ProductRow = {
  id: string;
  slug: string;
  name: string;
  priceMinor: number;
  categoryId: string;
  sourceId: string;
  descriptionHtml: string;
  images: { full: string; thumb: string }[];
  deletedAt: Date | null;
  publishedAt: Date | null;
  updatedAt: Date;
  priceBasisPieces: number;
  piecesPerPack: number | null;
  packsPerBox: number | null;
  minPieceQty: number;
  boxVolume: string | null;
  boxWeight: string | null;
  boxCount: number;
  lineNoteEnabled: boolean;
  lineNotePrompt: string | null;
  stockPieces: number | null;
  lowStockThresholdPieces: number | null;
  availability: ProductAvailability | null;
};

/**
 * The admin write model for products — the counterpart to the read-only
 * `CatalogService`. Descriptions are sanitized here (the single write path, so
 * nothing reaches the column unsanitized); soft delete/restore flip
 * `deletedAt`. Storage split (ADR 0022) is preserved — this service simply lets
 * the admin edit every field.
 */
@Injectable()
export class AdminProductsService {
  constructor(
    @Inject(DRIZZLE) private db: NodePgDatabase<typeof schema>,
    // The last rung of the "few left" ladder, injected the way every other
    // deployment rule is — a spec hands over a figure without a config file.
    @Inject(LOW_STOCK_THRESHOLD_PIECES) private lowStockFallback: number,
  ) {}

  /**
   * The admin grid (FR-ADM-05): filtered by publication state and category,
   * searched by name or sync key, sorted. Unlike the storefront listing this
   * shows soft-deleted rows by default — `state` narrows, it does not widen.
   *
   * Runs in a transaction for the same reason the storefront search does: the
   * trigram threshold is set with `SET LOCAL`, so the matcher's recall cannot
   * depend on the server default. Not logged as a search (NFR-OPS-05) — the
   * search log measures what customers look for, and an admin looking up a row
   * they are about to edit would poison that.
   */
  async listProducts(query: AdminProductListQuery): Promise<{
    items: AdminProductListItem[];
    pagination: {
      page: number;
      pageSize: number;
      total: number;
      totalPages: number;
    };
  }> {
    const pageSize = ADMIN_CATALOG_PAGE_SIZE;
    const search = parseSearchQuery(query.q);
    const where = and(
      query.categoryId ? eq(products.categoryId, query.categoryId) : undefined,
      // `live` is what the storefront shows: published and not deleted.
      query.state === 'live'
        ? and(isNull(products.deletedAt), isNotNull(products.publishedAt))
        : undefined,
      query.state === 'unpublished'
        ? and(isNull(products.deletedAt), isNull(products.publishedAt))
        : undefined,
      query.state === 'deleted' ? isNotNull(products.deletedAt) : undefined,
      // The stored state, not the count: the threshold that decides "few left"
      // follows the packaging, and a filter that re-derived it here would go
      // out of step with the badge beside it the first time a box changed size.
      query.availability
        ? eq(products.availability, query.availability)
        : undefined,
      // The inventory's drill-down: the products carrying one attribute key,
      // and optionally one of its values.
      attributeFilterCondition(
        this.db,
        query.attributeKey,
        query.attributeValue,
      ),
      // Where the tier list's price count leads: the products this tier has a
      // price of its own for.
      tierPriceCondition(this.db, query.tierId),
      adminSearchCondition(query.q) ?? undefined,
    );
    // Only rank when the box holds something the name matcher could score; a
    // sync-key-only lookup has no meaningful relevance and falls back to name.
    const score = search ? relevanceScore(search) : undefined;

    return this.db.transaction(async (tx) => {
      await tx.execute(setSearchThreshold);

      const [{ value: total }] = await tx
        .select({ value: count() })
        .from(products)
        .where(where);

      const rows = await tx
        .select({
          slug: products.slug,
          name: products.name,
          priceMinor: products.defaultPriceMinor,
          categoryId: products.categoryId,
          sourceId: products.sourceId,
          images: products.images,
          deletedAt: products.deletedAt,
          publishedAt: products.publishedAt,
          updatedAt: products.updatedAt,
          availability: products.availability,
          stockPieces: products.stockPieces,
        })
        .from(products)
        .where(where)
        .orderBy(...adminProductOrderBy(query.sort, score))
        .limit(pageSize)
        .offset((query.page - 1) * pageSize);

      return {
        items: rows.map((r) => ({
          slug: r.slug,
          name: r.name,
          priceMinor: r.priceMinor,
          categoryId: r.categoryId,
          sourceId: r.sourceId,
          thumb: r.images[0]?.thumb ?? null,
          availability: r.availability,
          stockPieces: r.stockPieces,
          deletedAt: r.deletedAt?.toISOString() ?? null,
          publishedAt: r.publishedAt?.toISOString() ?? null,
          updatedAt: r.updatedAt.toISOString(),
        })),
        pagination: {
          page: query.page,
          pageSize,
          total: Number(total),
          totalPages: Math.ceil(Number(total) / pageSize),
        },
      };
    });
  }

  /** Loads a product in editable form regardless of soft-delete state. */
  async getProduct(slug: string): Promise<AdminProduct | null> {
    const row = await this.productBySlug(slug);
    if (!row) return null;
    return toAdminProduct(
      row,
      await this.tierPricesFor(row.id),
      await this.attributesFor(row.id),
      await this.pairingsFor(row.id),
      await this.documentsFor(row.id),
    );
  }

  async createProduct(
    input: ProductInput,
    actorId: string,
  ): Promise<AdminProduct> {
    await assertCategoryExists(this.db, input.categoryId);
    const slug = await resolveNewSlug(
      this.db,
      products,
      input.slug,
      input.name,
      'product',
    );
    const sourceId = await resolveNewSourceId(
      this.db,
      products,
      input.sourceId,
    );

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
            defaultPriceMinor: input.priceMinor,
            categoryId: input.categoryId,
            descriptionHtml: sanitizeProductRichText(input.descriptionHtml),
            images: input.images,
            lineNoteEnabled: input.lineNoteEnabled,
            lineNotePrompt: input.lineNotePrompt,
            updatedBy: actorId,
            ...packagingValues(input),
            ...this.stockValues(input),
          })
          .returning(adminProductColumns),
      );
      await this.replaceTierPrices(tx, row[0].id, input.tierPrices);
      const attributes = storedAttributes(input.attributes);
      await this.replaceAttributes(tx, row[0].id, attributes);
      await this.replacePairings(
        tx,
        row[0].id,
        paired.map((p) => p.id),
      );
      await this.replaceDocumentLinks(tx, row[0].id, linked);
      return toAdminProduct(
        row[0],
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
    const existing = await this.productBySlug(slug);
    if (!existing) throw productNotFound();
    await assertCategoryExists(this.db, input.categoryId);

    const newSlug = await resolveSlugOverride(
      this.db,
      products,
      input.slug,
      existing.slug,
    );
    const newSourceId = await resolveSourceIdOverride(
      this.db,
      products,
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
            defaultPriceMinor: input.priceMinor,
            categoryId: input.categoryId,
            descriptionHtml: sanitizeProductRichText(input.descriptionHtml),
            images: input.images,
            lineNoteEnabled: input.lineNoteEnabled,
            lineNotePrompt: input.lineNotePrompt,
            sourceId: newSourceId,
            updatedAt: new Date(),
            updatedBy: actorId,
            ...packagingValues(input),
            ...this.stockValues(input),
          })
          .where(eq(products.id, existing.id))
          .returning(adminProductColumns),
      );
      await this.replaceTierPrices(tx, existing.id, input.tierPrices);
      const attributes = storedAttributes(input.attributes);
      await this.replaceAttributes(tx, existing.id, attributes);
      await this.replacePairings(
        tx,
        existing.id,
        paired.map((p) => p.id),
      );
      await this.replaceDocumentLinks(tx, existing.id, linked);
      return toAdminProduct(
        row[0],
        input.tierPrices,
        attributes,
        namedPairings(paired),
        linked,
      );
    });
  }

  /**
   * Soft delete: sets `deletedAt`, reversible via restore. Genuinely
   * idempotent — re-deleting an already-deleted product is a no-op that leaves
   * its original `deletedAt`/`updatedAt` untouched (coalesce keeps the first
   * timestamp; `updatedAt` only moves on the live→deleted transition).
   */
  async deleteProduct(slug: string, actorId: string): Promise<AdminProduct> {
    const now = new Date();
    const rows = await this.db
      .update(products)
      .set({
        deletedAt: sql`coalesce(${products.deletedAt}, ${now})`,
        updatedAt: sql`case when ${products.deletedAt} is null then ${now} else ${products.updatedAt} end`,
        // Attributed on the live->deleted transition only, so a repeat delete
        // does not rewrite who actually removed it.
        deletedBy: sql`case when ${products.deletedAt} is null then ${actorId}::uuid else ${products.deletedBy} end`,
      })
      .where(eq(products.slug, slug))
      .returning(adminProductColumns);
    if (!rows[0]) throw productNotFound();
    // Soft delete leaves the tier prices alone — they belong to the product,
    // and hiding it is reversible.
    return toAdminProduct(
      rows[0],
      await this.tierPricesFor(rows[0].id),
      await this.attributesFor(rows[0].id),
      await this.pairingsFor(rows[0].id),
      await this.documentsFor(rows[0].id),
    );
  }

  async restoreProduct(slug: string, actorId: string): Promise<AdminProduct> {
    const rows = await this.db
      .update(products)
      .set({
        deletedAt: null,
        deletedBy: null,
        updatedAt: new Date(),
        updatedBy: actorId,
      })
      .where(eq(products.slug, slug))
      .returning(adminProductColumns);
    if (!rows[0]) throw productNotFound();
    return toAdminProduct(
      rows[0],
      await this.tierPricesFor(rows[0].id),
      await this.attributesFor(rows[0].id),
      await this.pairingsFor(rows[0].id),
      await this.documentsFor(rows[0].id),
    );
  }

  /**
   * Put a product on the storefront, or take it off (FR-ADM-06).
   *
   * Independent of soft deletion: publishing a deleted product does not restore
   * it, and restoring an unpublished one does not publish it. `publishedBy`
   * records who accepted the price going public, and is cleared on the way back
   * so it never names somebody for a decision that has been undone.
   */
  async setProductPublished(
    slug: string,
    published: boolean,
    actorId: string,
  ): Promise<AdminProduct> {
    const rows = await this.db
      .update(products)
      .set({
        publishedAt: published ? new Date() : null,
        publishedBy: published ? actorId : null,
        updatedAt: new Date(),
        updatedBy: actorId,
      })
      .where(eq(products.slug, slug))
      .returning(adminProductColumns);
    if (!rows[0]) throw productNotFound();
    return toAdminProduct(
      rows[0],
      await this.tierPricesFor(rows[0].id),
      await this.attributesFor(rows[0].id),
      await this.pairingsFor(rows[0].id),
      await this.documentsFor(rows[0].id),
    );
  }

  /**
   * What this category's subtree holds that the storefront does not show:
   * soft-deleted, unpublished, or both. Aggregates over descendants exactly like
   * the storefront grid (Pattern A), so the edit-mode overlay and the live grid
   * agree on what belongs to a category.
   */
  async listHiddenProducts(slug: string): Promise<HiddenProduct[]> {
    const rows = await this.db
      .select({
        id: categories.id,
        slug: categories.slug,
        name: categories.name,
        shortName: categories.shortName,
        parentId: categories.parentId,
        image: categories.image,
        sortOrder: categories.sortOrder,
      })
      .from(categories);
    const category = categoryBySlug(rows, slug);
    if (!category) throw categoryNotFound();

    const ids = descendantIds(category.id, rows);
    // Default-list prices: staff have no tier.
    const hidden = await this.db
      .select({
        slug: products.slug,
        name: products.name,
        priceMinor: products.defaultPriceMinor,
        images: products.images,
        deletedAt: products.deletedAt,
        publishedAt: products.publishedAt,
        ...unitColumns,
        ...noteColumns,
        ...availabilityColumns,
        pairedCount: pairedCountOf(),
      })
      .from(products)
      .where(
        and(
          inArray(products.categoryId, ids),
          or(isNotNull(products.deletedAt), isNull(products.publishedAt)),
        ),
      )
      .orderBy(asc(products.name));
    return hidden.map((row) => ({
      ...toListItem(row),
      deleted: row.deletedAt !== null,
      unpublished: row.publishedAt === null,
    }));
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

  private async productBySlug(slug: string): Promise<ProductRow | undefined> {
    const [row] = await this.db
      .select(adminProductColumns)
      .from(products)
      .where(eq(products.slug, slug))
      .limit(1);
    return row;
  }

  /**
   * The tier overrides stored for a product. The base price is never in here —
   * it is `products.defaultPriceMinor` — so an empty result means "this product
   * costs the same in every tier".
   */
  private async tierPricesFor(productId: string): Promise<ProductTierPrice[]> {
    return this.db
      .select({
        tierId: productPrices.tierId,
        priceMinor: productPrices.priceMinor,
      })
      .from(productPrices)
      .where(eq(productPrices.productId, productId))
      .orderBy(asc(productPrices.tierId));
  }

  /**
   * The single write path for tier prices. The posted list is the whole truth:
   * what is missing from it is deleted, so removing a product's override in the
   * editor returns that tier to the base price.
   */
  private async replaceTierPrices(
    tx: NodePgDatabase<typeof schema>,
    productId: string,
    entries: ProductTierPrice[],
  ): Promise<void> {
    const keep = entries.map((e) => e.tierId);
    await tx
      .delete(productPrices)
      .where(
        and(
          eq(productPrices.productId, productId),
          keep.length > 0 ? notInArray(productPrices.tierId, keep) : undefined,
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
          priceMinor: sql`excluded."priceMinor"`,
          updatedAt: new Date(),
        },
      });
  }

  /**
   * A product's attributes in the grid's row order. `sortOrder` is data, so it
   * has to be asked for — array position no longer carries the order.
   */
  private async attributesFor(productId: string): Promise<ProductAttribute[]> {
    return this.db
      .select({
        key: productAttributes.key,
        value: productAttributes.value,
      })
      .from(productAttributes)
      .where(eq(productAttributes.productId, productId))
      .orderBy(asc(productAttributes.sortOrder));
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
    entries: ProductAttribute[],
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
          value: entry.value,
          valueNumeric: numeric === null ? null : String(numeric),
        };
      }),
    );
  }

  /**
   * The products this one is sold together with (FR-SET-01), in name order —
   * the order the editor lists them in, and the only one an admin can predict.
   *
   * An edge is stored once, so a product's neighbours sit on whichever side it
   * is not: the `case` picks the other end, and the `or` is what makes the
   * table read the same from both products.
   */
  private async pairingsFor(productId: string): Promise<PairedProduct[]> {
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
  ): Promise<(PairedProduct & { id: string })[]> {
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
function storedAttributes(entries: ProductAttribute[]): ProductAttribute[] {
  // Both sides arrive trimmed from the contract.
  return entries.filter((entry) => entry.key !== '' && entry.value !== '');
}

/**
 * The counterparts as the contract serializes them. The resolved rows carry the
 * id the write needs, and the output schema is strict — an extra field is a 500
 * rather than a wrong answer, which is how this was caught.
 */
function namedPairings(
  resolved: (PairedProduct & { id: string })[],
): PairedProduct[] {
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

function toAdminProduct(
  row: ProductRow,
  tierPrices: ProductTierPrice[],
  attributes: ProductAttribute[],
  pairings: PairedProduct[],
  documents: LinkedDocument[],
): AdminProduct {
  return {
    slug: row.slug,
    name: row.name,
    priceMinor: row.priceMinor,
    categoryId: row.categoryId,
    sourceId: row.sourceId,
    descriptionHtml: row.descriptionHtml,
    attributes,
    images: row.images,
    tierPrices,
    pairings,
    documents,
    deletedAt: row.deletedAt?.toISOString() ?? null,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    updatedAt: row.updatedAt.toISOString(),
    priceBasisPieces: row.priceBasisPieces,
    piecesPerPack: row.piecesPerPack,
    packsPerBox: row.packsPerBox,
    minPieceQty: row.minPieceQty,
    boxVolume: row.boxVolume,
    boxWeight: row.boxWeight,
    boxCount: row.boxCount,
    lineNoteEnabled: row.lineNoteEnabled,
    lineNotePrompt: row.lineNotePrompt,
    stockPieces: row.stockPieces,
    lowStockThresholdPieces: row.lowStockThresholdPieces,
    availability: row.availability,
  };
}

/** The packaging columns as create and update both write them. */
function packagingValues(input: ProductInput) {
  return {
    priceBasisPieces: input.priceBasisPieces,
    piecesPerPack: input.piecesPerPack,
    packsPerBox: input.packsPerBox,
    minPieceQty: input.minPieceQty,
    boxVolume: input.boxVolume,
    boxWeight: input.boxWeight,
    boxCount: input.boxCount,
  };
}
