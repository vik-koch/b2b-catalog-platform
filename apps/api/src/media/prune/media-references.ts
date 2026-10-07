import { isNotNull } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import {
  DOCUMENT_URL_PREFIX,
  MEDIA_URL_PREFIX,
} from '@b2b-catalog-platform/shared';
import * as schema from '../../db/schema';
import {
  categories,
  documents,
  orderItems,
  pageVersions,
  products,
} from '../../db/schema';

export type MediaReferenceDb = NodePgDatabase<typeof schema>;

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
  collect(db: MediaReferenceDb): Promise<string[]>;
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
    // Every version, not only the current: an old text must still render as
    // it was published.
    name: 'page bodies',
    async collect(db) {
      const rows = await db
        .select({ bodyHtml: pageVersions.bodyHtml })
        .from(pageVersions);
      return rows.flatMap((row) => mediaFilenamesInHtml(row.bodyHtml));
    },
  },
  {
    // The images jsonb holds { full, thumb } URL pairs; scanning its text form
    // captures both filenames per image.
    name: 'product images',
    async collect(db) {
      const rows = await db.select({ images: products.images }).from(products);
      return rows.flatMap((row) =>
        mediaFilenamesInHtml(JSON.stringify(row.images)),
      );
    },
  },
  {
    // An order line keeps the thumbnail the product had when it was ordered.
    // The product may since have been re-imaged or soft-deleted, so this is
    // the one source whose files nothing else references any more — and an
    // order that loses its picture loses part of what was ordered.
    name: 'order line thumbnails',
    async collect(db) {
      const rows = await db
        .select({ thumbnail: orderItems.thumbnail })
        .from(orderItems)
        .where(isNotNull(orderItems.thumbnail));
      return rows.flatMap((row) => mediaFilenamesInHtml(row.thumbnail ?? ''));
    },
  },
  {
    // The chip mark (FR-CAT-07) is a jsonb { full, thumb } pair; scanning its
    // text form captures both filenames.
    name: 'category marks',
    async collect(db) {
      const rows = await db
        .select({ mark: categories.mark })
        .from(categories)
        .where(isNotNull(categories.mark));
      return rows.flatMap((row) =>
        mediaFilenamesInHtml(JSON.stringify(row.mark)),
      );
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
    async collect(db) {
      // A link-only document has no file to keep.
      const rows = await db
        .select({ fileUrl: documents.fileUrl })
        .from(documents)
        .where(isNotNull(documents.fileUrl));
      return rows.flatMap((row) => documentFilenames(row.fileUrl ?? ''));
    },
  },
];

/** Union of the filenames every registered source currently references. */
export async function collectReferencedFilenames(
  db: MediaReferenceDb,
  sources: readonly MediaReferenceSource[] = MEDIA_REFERENCE_SOURCES,
): Promise<Set<string>> {
  const referenced = new Set<string>();
  for (const source of sources) {
    for (const filename of await source.collect(db)) {
      referenced.add(filename);
    }
  }
  return referenced;
}
