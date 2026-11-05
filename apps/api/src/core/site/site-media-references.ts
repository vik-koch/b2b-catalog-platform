import {
  MediaReferenceSource,
  mediaFilenamesInHtml,
} from '../../platform/media/prune/media-references';
import { pageVersions } from './site-schema';

/** Every version: an old text must still render as it was published. */
export const pageBodyMedia: MediaReferenceSource = {
  name: 'page bodies',
  async collect(db) {
    const rows = await db
      .select({ bodyHtml: pageVersions.bodyHtml })
      .from(pageVersions);
    return rows.flatMap((row) => mediaFilenamesInHtml(row.bodyHtml));
  },
};
