import { isNotNull } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import {
  DOCUMENT_URL_PREFIX,
  MEDIA_URL_PREFIX,
} from '@b2b-catalog-platform/shared/platform';
import * as schema from '../../db/schema';
import {
  categories,
  documents,
  orderItems,
  pageVersions,
  products,
} from '../../db/schema';

type MediaReferenceDb = NodePgDatabase<typeof schema>;

/** The filenames under `prefix` in a stored string, in the charset the
 * sanitizer's src check admits. */
const filenamesUnder = (prefix: string) => {
  const reference = new RegExp(`${prefix}/([A-Za-z0-9._-]+)`, 'g');
  return (text: string): string[] =>
    [...text.matchAll(reference)].map((match) => match[1]);
};

export const mediaFilenamesInHtml = filenamesUnder(MEDIA_URL_PREFIX);

export const documentFilenames = filenamesUnder(DOCUMENT_URL_PREFIX);

/** A place stored content can reference an uploaded file. */
export interface MediaReferenceSource {
  readonly name: string;
  collect(db: MediaReferenceDb): Promise<string[]>;
}

/** Every place a `/media` URL can be stored. A column missing here has its
 * files DELETED by the sweep as orphans. */
export const MEDIA_REFERENCE_SOURCES: readonly MediaReferenceSource[] = [
  {
    // Every version: an old text must still render as it was published.
    name: 'page bodies',
    async collect(db) {
      const rows = await db
        .select({ bodyHtml: pageVersions.bodyHtml })
        .from(pageVersions);
      return rows.flatMap((row) => mediaFilenamesInHtml(row.bodyHtml));
    },
  },
  {
    // `{ full, thumb }` pairs; the text form holds both.
    name: 'product images',
    async collect(db) {
      const rows = await db.select({ images: products.images }).from(products);
      return rows.flatMap((row) =>
        mediaFilenamesInHtml(JSON.stringify(row.images)),
      );
    },
  },
  {
    // The thumbnail at ordering time, which the product may no longer hold.
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
    // A `{ full, thumb }` pair (FR-CAT-07).
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

/** The same for `/documents`, swept on its own. A replaced file is referenced
 * by nothing, which is what the sweep deletes. */
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
