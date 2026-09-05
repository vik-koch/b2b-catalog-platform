import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { asc, desc, eq } from 'drizzle-orm';
import { DocumentInput, ProductDocument } from '@b2b-catalog-platform/shared';
import { DRIZZLE } from '../db/database.module';
import * as schema from '../db/schema';
import { documents } from '../db/schema';

/** The one 404 this surface has; a function so each throw gets its own stack. */
const notFound = () =>
  new NotFoundException({
    code: 'document-not-found',
    message: 'Document not found',
  });

/** A row as it is stored, from the columns the table actually has. */
type DocumentRow = typeof documents.$inferSelect;

/**
 * The stored row as the contract shows it: the four file columns are one
 * object, because the file is what an admin replaces in a single step and
 * nothing outside this table uses them apart.
 */
function toDocument(row: DocumentRow): ProductDocument {
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
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Product documents (FR-DOC-01) — the rows; the bytes are the media store's.
 *
 * Replacing a file is an ordinary update of the same row, which is the whole
 * of the "a re-issued document supersedes its predecessor" story: no
 * supersession pointer, no version chain, and nothing to inherit. The bytes it
 * replaced are left to the prune sweep, which deletes exactly the files no row
 * points at any more.
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
   */
  async listDocuments(): Promise<ProductDocument[]> {
    const rows = await this.db
      .select()
      .from(documents)
      .orderBy(asc(documents.expiresAt), desc(documents.updatedAt));
    return rows.map(toDocument);
  }

  async getDocument(id: string): Promise<ProductDocument> {
    const [row] = await this.db
      .select()
      .from(documents)
      .where(eq(documents.id, id));
    if (!row) throw notFound();
    return toDocument(row);
  }

  async createDocument(
    input: DocumentInput,
    actorId: string,
  ): Promise<ProductDocument> {
    const [row] = await this.db
      .insert(documents)
      .values({ ...columns(input), updatedBy: actorId })
      .returning();
    return toDocument(row);
  }

  /** The whole record in one write, file included. */
  async updateDocument(
    id: string,
    input: DocumentInput,
    actorId: string,
  ): Promise<ProductDocument> {
    const [row] = await this.db
      .update(documents)
      .set({ ...columns(input), updatedBy: actorId, updatedAt: new Date() })
      .where(eq(documents.id, id))
      .returning();
    if (!row) throw notFound();
    return toDocument(row);
  }

  /** Deletes the row only. The file goes when the sweep finds nothing pointing
   * at it, which is also what covers the bytes a replacement left behind. */
  async deleteDocument(id: string): Promise<ProductDocument> {
    const [row] = await this.db
      .delete(documents)
      .where(eq(documents.id, id))
      .returning();
    if (!row) throw notFound();
    return toDocument(row);
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
