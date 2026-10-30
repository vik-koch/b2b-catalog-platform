import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { and, asc, desc, eq, inArray, isNull, notInArray } from 'drizzle-orm';
import {
  DocumentDetail,
  DocumentInput,
  LinkedProduct,
  ProductDocument,
  StoredDocumentFile,
} from '@b2b-catalog-platform/shared/admin/catalog';
import { DRIZZLE } from '../../../db/database.module';
import * as schema from '../../../db/schema';
import { documentProducts, documents, products } from '../../../db/schema';
import {
  linkedProductColumns,
  toLinkedProduct,
} from '../products/product-records';

/** A function, so each throw gets its own stack. */
const notFound = () =>
  new NotFoundException({
    code: 'document-not-found',
    message: 'Document not found',
  });

/** A slug in `productSlugs` that names nothing. */
const productNotFound = () =>
  new NotFoundException({
    code: 'document-product-not-found',
    message: 'Product not found',
  });

type DocumentRow = typeof documents.$inferSelect;

/** The stored row as the contract shows it, the four file columns as one
 * object. A check constraint keeps them null together, so `fileUrl` speaks for
 * all four. */
function toDocument(
  row: DocumentRow,
  productCount: number,
  unpublishedProductCount: number,
): ProductDocument {
  return {
    id: row.id,
    title: row.title,
    file:
      row.fileUrl === null
        ? null
        : {
            url: row.fileUrl,
            name: row.fileName as string,
            contentType: row.contentType as StoredDocumentFile['contentType'],
            byteSize: row.byteSize as number,
          },
    link: row.link,
    issuedAt: row.issuedAt,
    expiresAt: row.expiresAt,
    productCount,
    unpublishedProductCount,
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Product documents (FR-DOC-01/02) and their product links; the bytes are the
 * media store's. A re-issued document is an update of the same row, so its
 * links stay; the replaced bytes go with the sweep.
 */
@Injectable()
export class DocumentsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  /** Every document, soonest expiry first, undated last. A few dozen rows, so
   * unpaged. */
  async listDocuments(): Promise<ProductDocument[]> {
    const rows = await this.db
      .select(this.countedColumns())
      .from(documents)
      .orderBy(asc(documents.expiresAt), desc(documents.updatedAt));
    return rows.map(({ row, productCount, unpublishedProductCount }) =>
      toDocument(row, productCount, unpublishedProductCount),
    );
  }

  async getDocument(id: string): Promise<DocumentDetail> {
    const [found] = await this.db
      .select(this.countedColumns())
      .from(documents)
      .where(eq(documents.id, id));
    if (!found) throw notFound();
    return {
      ...toDocument(
        found.row,
        found.productCount,
        found.unpublishedProductCount,
      ),
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
        .values({ ...storedColumns(input), updatedBy: actorId })
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
        .set({
          ...storedColumns(input),
          updatedBy: actorId,
          updatedAt: new Date(),
        })
        .where(eq(documents.id, id))
        .returning({ id: documents.id });
      if (!row) throw notFound();
      await this.replaceLinks(tx, id, productIds);
    });
    return this.getDocument(id);
  }

  /** Deletes the row and, by cascade, its links; the file goes with the
   * sweep. */
  async deleteDocument(id: string): Promise<ProductDocument> {
    const [row] = await this.db
      .delete(documents)
      .where(eq(documents.id, id))
      .returning();
    if (!row) throw notFound();
    return toDocument(row, 0, 0);
  }

  /** The products showing one document, in name order. */
  private async productsFor(documentId: string): Promise<LinkedProduct[]> {
    const rows = await this.db
      .select(linkedProductColumns)
      .from(documentProducts)
      .innerJoin(products, eq(products.id, documentProducts.productId))
      .where(eq(documentProducts.documentId, documentId))
      .orderBy(asc(products.name));
    return rows.map(toLinkedProduct);
  }

  /**
   * How many catalog products carry a document (FR-ADM-22). `$count` rather
   * than an `sql` subquery, where the outer `documents.id` would bind
   * unqualified to the wrong table.
   */
  private productCount(unpublished = false) {
    return this.db.$count(
      documentProducts,
      and(
        eq(documentProducts.documentId, documents.id),
        inArray(
          documentProducts.productId,
          this.db
            .select({ id: products.id })
            .from(products)
            .where(
              and(
                isNull(products.deletedAt),
                unpublished ? isNull(products.publishedAt) : undefined,
              ),
            ),
        ),
      ),
    );
  }

  /** The row and both its counts. */
  private countedColumns() {
    return {
      row: documents,
      productCount: this.productCount(),
      unpublishedProductCount: this.productCount(true),
    };
  }

  /** The products a save named, before the transaction: an unknown slug is a
   * 404 naming it, and soft-deleted ones resolve like any other. */
  private async resolveProducts(slugs: string[]): Promise<string[]> {
    if (slugs.length === 0) return [];
    const rows = await this.db
      .select({ id: products.id })
      .from(products)
      .where(inArray(products.slug, slugs));
    if (rows.length !== slugs.length) throw productNotFound();
    return rows.map((row) => row.id);
  }

  /** The links, replaced by what was posted; kept ones are left alone, so a
   * save does not re-date them. */
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

/** The input as stored: the nested file flattened onto its columns. */
function storedColumns(input: DocumentInput) {
  return {
    title: input.title,
    fileUrl: input.file?.url ?? null,
    fileName: input.file?.name ?? null,
    contentType: input.file?.contentType ?? null,
    byteSize: input.file?.byteSize ?? null,
    link: input.link,
    issuedAt: input.issuedAt,
    expiresAt: input.expiresAt,
  };
}
