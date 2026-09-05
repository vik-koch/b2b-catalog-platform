import { Client } from 'pg';
import { DocumentSeed, documentSeeds } from './document-data';
import {
  placeholderPdf,
  storePlaceholderDocument,
} from './document-placeholders';

/** An ISO day `days` from today, or null. */
function day(days: number | null): string | null {
  if (days === null) return null;
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/**
 * Seeds the demo documents, each with a generated placeholder PDF written to
 * the document store. Idempotent — matched by title, which is the only identity
 * a document has, and the files are content-addressed, so a re-seed neither
 * duplicates rows nor files.
 */
export async function seedDocuments(
  client: Client,
  mediaRoot: string,
): Promise<void> {
  for (const seed of documentSeeds) {
    const file = await storePlaceholderDocument(
      mediaRoot,
      seed.fileName,
      placeholderPdf(seed.title, seed.body),
    );
    const values = [
      seed.title,
      file.url,
      file.name,
      'application/pdf',
      file.byteSize,
      day(seed.issuedDaysAgo === null ? null : -seed.issuedDaysAgo),
      day(seed.expiresInDays),
    ];

    const updated = await client.query<{ id: string }>(
      `UPDATE documents SET "fileUrl" = $2, "fileName" = $3, "contentType" = $4,
         "byteSize" = $5, "issuedAt" = $6, "expiresAt" = $7, "updatedAt" = now()
       WHERE title = $1
       RETURNING id`,
      values,
    );
    const inserted = updated.rowCount
      ? updated
      : await client.query<{ id: string }>(
          `INSERT INTO documents (title, "fileUrl", "fileName", "contentType",
             "byteSize", "issuedAt", "expiresAt")
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING id`,
          values,
        );
    await linkProducts(client, inserted.rows[0].id, seed);
  }
}

/**
 * The demo's own links (FR-DOC-02). Only inserted, never removed — the same
 * rule the pairing seed follows: a link an admin made in the demo is
 * indistinguishable from one of these apart from the pair it names, and a
 * re-seed is not the place to decide it was a mistake.
 */
async function linkProducts(
  client: Client,
  documentId: string,
  seed: DocumentSeed,
): Promise<void> {
  if (seed.categorySlugs?.length) {
    await client.query(
      `INSERT INTO document_products ("documentId", "productId")
       SELECT $1, p.id FROM products p
       JOIN categories c ON c.id = p."categoryId"
       WHERE c.slug = ANY($2)
       ON CONFLICT DO NOTHING`,
      [documentId, seed.categorySlugs],
    );
  }
  if (seed.productSlugs?.length) {
    await client.query(
      `INSERT INTO document_products ("documentId", "productId")
       SELECT $1, p.id FROM products p WHERE p.slug = ANY($2)
       ON CONFLICT DO NOTHING`,
      [documentId, seed.productSlugs],
    );
  }
}
