import { isNotNull } from 'drizzle-orm';

import {
  documentFilenames,
  mediaFilenamesInHtml,
  MediaReferenceSource,
} from '../../platform/media/prune/media-references';
import { categories, documents, products } from './catalog-schema';

/** `{ full, thumb }` pairs; the text form holds both. */
export const productImageMedia: MediaReferenceSource = {
  name: 'product images',
  async collect(db) {
    const rows = await db.select({ images: products.images }).from(products);
    return rows.flatMap((row) =>
      mediaFilenamesInHtml(JSON.stringify(row.images)),
    );
  },
};

/** A `{ full, thumb }` pair (FR-CAT-07). */
export const categoryMarkMedia: MediaReferenceSource = {
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
};

/** A link-only document has no file to keep. */
export const documentFileReferences: MediaReferenceSource = {
  name: 'document files',
  async collect(db) {
    const rows = await db
      .select({ fileUrl: documents.fileUrl })
      .from(documents)
      .where(isNotNull(documents.fileUrl));
    return rows.flatMap((row) => documentFilenames(row.fileUrl ?? ''));
  },
};
