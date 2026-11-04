import sharp from 'sharp';
import {
  MEDIA_MAX_IMAGE_WIDTH,
  AcceptedImageMime,
} from '@b2b-catalog-platform/shared/platform';

/** The single stored format for page images; also the returned extension. */
export const STORED_IMAGE_EXT = 'webp';

/**
 * A WebP no wider than `maxWidth`, never enlarged, with EXIF orientation
 * applied and other metadata dropped; a GIF stays animated. `square`
 * centre-crops first, for a category mark, sized by the shorter edge.
 */
export async function processImage(
  bytes: Buffer,
  mime: AcceptedImageMime,
  maxWidth: number = MEDIA_MAX_IMAGE_WIDTH,
  square = false,
): Promise<Buffer> {
  const animated = mime === 'image/gif';
  const image = sharp(bytes, { animated }).rotate();
  if (!square) {
    return image
      .resize({ width: maxWidth, withoutEnlargement: true })
      .webp()
      .toBuffer();
  }

  // Metadata predates the rotation; the shorter edge is the same either way.
  const meta = await sharp(bytes, { animated }).metadata();
  const height = (animated ? meta.pageHeight : meta.height) ?? maxWidth;
  const side = Math.min(maxWidth, meta.width ?? maxWidth, height);
  return image
    .resize({ width: side, height: side, fit: 'cover', position: 'centre' })
    .webp()
    .toBuffer();
}
