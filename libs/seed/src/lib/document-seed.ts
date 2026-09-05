import { Client } from 'pg';
import { documentSeeds } from './document-data';
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

    const updated = await client.query(
      `UPDATE documents SET "fileUrl" = $2, "fileName" = $3, "contentType" = $4,
         "byteSize" = $5, "issuedAt" = $6, "expiresAt" = $7, "updatedAt" = now()
       WHERE title = $1`,
      values,
    );
    if (updated.rowCount === 0) {
      await client.query(
        `INSERT INTO documents (title, "fileUrl", "fileName", "contentType",
           "byteSize", "issuedAt", "expiresAt")
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        values,
      );
    }
  }
}
