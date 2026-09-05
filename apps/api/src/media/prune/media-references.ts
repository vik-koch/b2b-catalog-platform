import { Client } from 'pg';
import {
  DOCUMENT_URL_PREFIX,
  MEDIA_URL_PREFIX,
} from '@b2b-catalog-platform/shared';

// Matches every /media/<filename> occurrence in a stored string. The filename
// charset mirrors the sanitizer's src guard, so extraction and validation can
// never disagree about what a valid reference looks like.
const MEDIA_REFERENCE = new RegExp(
  `${MEDIA_URL_PREFIX}/([A-Za-z0-9._-]+)`,
  'g',
);

/** The same, for the /documents subtree — a document's URL is a column, not
 * prose, but the extraction is the one already proven here. */
const DOCUMENT_REFERENCE = new RegExp(
  `${DOCUMENT_URL_PREFIX}/([A-Za-z0-9._-]+)`,
  'g',
);

/** Every stored media filename referenced by a blob of HTML (or plain text). */
export function mediaFilenamesInHtml(html: string): string[] {
  return [...html.matchAll(MEDIA_REFERENCE)].map((match) => match[1]);
}

/** Every stored document filename referenced by a stored string. */
export function documentFilenames(text: string): string[] {
  return [...text.matchAll(DOCUMENT_REFERENCE)].map((match) => match[1]);
}

/**
 * A place stored content can reference an uploaded media file. The prune sweep
 * (prune-media.ts) treats the union of every source's filenames as "in use" and
 * deletes only files no source references.
 */
export interface MediaReferenceSource {
  readonly name: string;
  collect(client: Client): Promise<string[]>;
}

/**
 * THE registry of media reference sources. This is a safety boundary, not a
 * convenience: a `/media` URL that can be stored but is NOT covered here will be
 * treated as an orphan and DELETED by the sweep. So whenever a new column or
 * entity can hold media (e.g. product rich descriptions or a product image
 * column when the catalog lands), it MUST be added here.
 */
export const MEDIA_REFERENCE_SOURCES: readonly MediaReferenceSource[] = [
  {
    name: 'page bodies',
    async collect(client) {
      const { rows } = await client.query<{ bodyHtml: string }>(
        'SELECT "bodyHtml" FROM pages',
      );
      return rows.flatMap((row) => mediaFilenamesInHtml(row.bodyHtml));
    },
  },
  {
    // The images jsonb holds { full, thumb } URL pairs; scanning its text form
    // captures both filenames per image.
    name: 'product images',
    async collect(client) {
      const { rows } = await client.query<{ images: string }>(
        `SELECT images::text AS images FROM products`,
      );
      return rows.flatMap((row) => mediaFilenamesInHtml(row.images));
    },
  },
  {
    // An order line keeps the thumbnail the product had when it was ordered.
    // The product may since have been re-imaged or soft-deleted, so this is
    // the one source whose files nothing else references any more — and an
    // order that loses its picture loses part of what was ordered.
    name: 'order line thumbnails',
    async collect(client) {
      const { rows } = await client.query<{ thumbnail: string }>(
        `SELECT thumbnail FROM order_items WHERE thumbnail IS NOT NULL`,
      );
      return rows.flatMap((row) => mediaFilenamesInHtml(row.thumbnail));
    },
  },
  {
    // image is a jsonb { full, thumb } pair; scanning its text form captures
    // both filenames.
    name: 'category images',
    async collect(client) {
      const { rows } = await client.query<{ image: string }>(
        `SELECT image::text AS image FROM categories WHERE image IS NOT NULL`,
      );
      return rows.flatMap((row) => mediaFilenamesInHtml(row.image));
    },
  },
];

/**
 * The same registry for the /documents subtree, which is swept separately
 * because it is a directory of its own with its own URL prefix. The same safety
 * boundary applies: a document URL that can be stored and is not collected here
 * is an orphan as far as the sweep is concerned, and gets DELETED.
 *
 * A replaced file leaves its predecessor referenced by nothing, which is
 * exactly what this deletes — there is no supersession chain to keep it alive.
 */
export const DOCUMENT_REFERENCE_SOURCES: readonly MediaReferenceSource[] = [
  {
    name: 'document files',
    async collect(client) {
      const { rows } = await client.query<{ fileUrl: string }>(
        'SELECT "fileUrl" FROM documents',
      );
      return rows.flatMap((row) => documentFilenames(row.fileUrl));
    },
  },
];

/** Union of the filenames every registered source currently references. */
export async function collectReferencedFilenames(
  client: Client,
  sources: readonly MediaReferenceSource[] = MEDIA_REFERENCE_SOURCES,
): Promise<Set<string>> {
  const referenced = new Set<string>();
  for (const source of sources) {
    for (const filename of await source.collect(client)) {
      referenced.add(filename);
    }
  }
  return referenced;
}
