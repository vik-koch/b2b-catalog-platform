import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { and, asc, desc, eq, inArray, notInArray } from 'drizzle-orm';
import {
  DocumentDetail,
  DocumentInput,
  DocumentProduct,
  ProductDocument,
} from '@b2b-catalog-platform/shared';
import { DRIZZLE } from '../db/database.module';
import * as schema from '../db/schema';
import { documentProducts, documents, products } from '../db/schema';

/** The one 404 the document itself has; a function so each throw gets its own
 * stack. */
const notFound = () =>
  new NotFoundException({
    code: 'document-not-found',
    message: 'Document not found',
  });

/** A slug in `productSlugs` that names nothing — the same class of mistake as
 * an unknown tier on a product save, and answered the same way. */
const productNotFound = () =>
  new NotFoundException({
    code: 'document-product-not-found',
    message: 'Product not found',
  });

/** A row as it is stored, from the columns the table actually has. */
type DocumentRow = typeof documents.$inferSelect;

/**
 * The stored row as the contract shows it: the four file columns are one
 * object, because the file is what an admin replaces in a single step and
 * nothing outside this table uses them apart.
 */
function toDocument(row: DocumentRow, productCount: number): ProductDocument {
  return {
    id: row.id,
    title: row.title,
    file: {
      url: row.fileUrl,
      name: row.fileName,
      contentType: row.contentType as ProductDocument['file']['contentType'],
      byteSize: row.byteSize,
    },
    issuedAt: row.issuedAt,
    expiresAt: row.expiresAt,
    productCount,
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Product documents (FR-DOC-01/02) — the rows and their product links; the
 * bytes are the media store's.
 *
 * Replacing a file is an ordinary update of the same row, which is the whole of
 * the "a re-issued document supersedes its predecessor" story: no supersession
 * pointer, no version chain, and — because the links hang off the row rather
 * than the file — nothing to inherit. The bytes it replaced are left to the
 * prune sweep, which deletes exactly the files no row points at any more.
 */
@Injectable()
export class DocumentsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  /**
   * Every document, soonest expiry first — an unexpiring one has nothing to
   * come due and sorts last. The list is a few dozen rows, so it is unpaged and
   * the admin grid narrows it in the browser.
   *
   * One product's documents are not read here: they ride in the product's own
   * payload, the way its pairings do, so the product editor makes one request
   * for the record it is editing.
   */
  async listDocuments(): Promise<ProductDocument[]> {
    const rows = await this.db
      .select({ row: documents, productCount: this.productCount() })
      .from(documents)
      .orderBy(asc(documents.expiresAt), desc(documents.updatedAt));
    return rows.map(({ row, productCount }) => toDocument(row, productCount));
  }

  async getDocument(id: string): Promise<DocumentDetail> {
    const [found] = await this.db
      .select({ row: documents, productCount: this.productCount() })
      .from(documents)
      .where(eq(documents.id, id));
    if (!found) throw notFound();
    return {
      ...toDocument(found.row, found.productCount),
      products: await this.productsFor(id),
    };
  }

  async createDocument(
    input: DocumentInput,
    actorId: string,
  ): Promise<DocumentDetail> {
    const productIds = await this.resolveProducts(input.productSlugs);
    const id = await this.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(documents)
        .values({ ...columns(input), updatedBy: actorId })
        .returning({ id: documents.id });
      await this.replaceLinks(tx, row.id, productIds);
      return row.id;
    });
    return this.getDocument(id);
  }

  /** The whole record in one write, file and links included. */
  async updateDocument(
    id: string,
    input: DocumentInput,
    actorId: string,
  ): Promise<DocumentDetail> {
    const productIds = await this.resolveProducts(input.productSlugs);
    await this.db.transaction(async (tx) => {
      const [row] = await tx
        .update(documents)
        .set({ ...columns(input), updatedBy: actorId, updatedAt: new Date() })
        .where(eq(documents.id, id))
        .returning({ id: documents.id });
      if (!row) throw notFound();
      await this.replaceLinks(tx, id, productIds);
    });
    return this.getDocument(id);
  }

  /** Deletes the row, and its links with it (the foreign key cascades). The
   * file goes when the sweep finds nothing pointing at it, which is also what
   * covers the bytes a replacement left behind. */
  async deleteDocument(id: string): Promise<ProductDocument> {
    const [row] = await this.db
      .delete(documents)
      .where(eq(documents.id, id))
      .returning();
    if (!row) throw notFound();
    return toDocument(row, 0);
  }

  /** The products showing one document, in name order — the order the editor
   * lists them in, and the only one an admin can predict. */
  private async productsFor(documentId: string): Promise<DocumentProduct[]> {
    const rows = await this.db
      .select({
        slug: products.slug,
        name: products.name,
        deletedAt: products.deletedAt,
        publishedAt: products.publishedAt,
      })
      .from(documentProducts)
      .innerJoin(products, eq(products.id, documentProducts.productId))
      .where(eq(documentProducts.documentId, documentId))
      .orderBy(asc(products.name));
    return rows.map((row) => ({
      slug: row.slug,
      name: row.name,
      deleted: row.deletedAt !== null,
      unpublished: row.publishedAt === null,
    }));
  }

  /**
   * How many products carry a document, counted per row. `$count` rather than
   * a hand-written subquery: inside an `sql` template drizzle emits column
   * names unqualified, so the outer `documents.id` would silently bind to
   * `document_products.documentId`'s table instead.
   */
  private productCount() {
    return this.db.$count(
      documentProducts,
      eq(documentProducts.documentId, documents.id),
    );
  }

  /**
   * The products a save named, resolved before the transaction opens so an
   * unknown slug is a 404 naming the product rather than a foreign-key error.
   *
   * Soft-deleted products resolve like any other: the editor lists them marked,
   * and a save that keeps them must not be the thing that drops them.
   */
  private async resolveProducts(slugs: string[]): Promise<string[]> {
    if (slugs.length === 0) return [];
    const rows = await this.db
      .select({ id: products.id })
      .from(products)
      .where(inArray(products.slug, slugs));
    if (rows.length !== slugs.length) throw productNotFound();
    return rows.map((row) => row.id);
  }

  /**
   * The single write path for links: the posted list is the whole truth.
   * Untouched links are left where they are (`onConflictDoNothing`), so saving
   * a document does not re-date the links it kept.
   */
  private async replaceLinks(
    tx: NodePgDatabase<typeof schema>,
    documentId: string,
    productIds: string[],
  ): Promise<void> {
    await tx
      .delete(documentProducts)
      .where(
        and(
          eq(documentProducts.documentId, documentId),
          productIds.length > 0
            ? notInArray(documentProducts.productId, productIds)
            : undefined,
        ),
      );
    if (productIds.length === 0) return;

    await tx
      .insert(documentProducts)
      .values(productIds.map((productId) => ({ documentId, productId })))
      .onConflictDoNothing();
  }
}

/** The contract's nested file, flattened onto the columns it is stored in. */
function columns(input: DocumentInput) {
  return {
    title: input.title,
    fileUrl: input.file.url,
    fileName: input.file.name,
    contentType: input.file.contentType,
    byteSize: input.file.byteSize,
    issuedAt: input.issuedAt,
    expiresAt: input.expiresAt,
  };
}
