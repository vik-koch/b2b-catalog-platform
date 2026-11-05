import { isNotNull } from 'drizzle-orm';
import {
  MediaReferenceSource,
  mediaFilenamesInHtml,
} from '../../platform/media/prune/media-references';
import { orderItems } from './ordering-schema';

/** The thumbnail at ordering time, which the product may no longer hold. */
export const orderLineThumbnailMedia: MediaReferenceSource = {
  name: 'order line thumbnails',
  async collect(db) {
    const rows = await db
      .select({ thumbnail: orderItems.thumbnail })
      .from(orderItems)
      .where(isNotNull(orderItems.thumbnail));
    return rows.flatMap((row) => mediaFilenamesInHtml(row.thumbnail ?? ''));
  },
};
