import {
  categoryMarkMedia,
  documentFileReferences,
  productImageMedia,
} from '../core/catalog/catalog-media-references';
import { orderLineThumbnailMedia } from '../core/ordering/ordering-media-references';
import { pageBodyMedia } from '../core/site/site-media-references';
import { MediaReferences } from '../platform/media/prune/media-references';

/**
 * Every place an uploaded file can be referenced. A column missing here has
 * its files DELETED by the sweep as orphans. A replaced document is referenced
 * by nothing, which is what the sweep deletes.
 */
export const MEDIA_REFERENCES: MediaReferences = {
  media: [
    pageBodyMedia,
    productImageMedia,
    orderLineThumbnailMedia,
    categoryMarkMedia,
  ],
  documents: [documentFileReferences],
};
