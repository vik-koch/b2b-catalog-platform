import sharp from 'sharp';
import {
  AcceptedImageMime,
  MEDIA_MAX_IMAGE_WIDTH,
} from '@b2b-catalog-platform/shared';

/** The single stored format for page images; also the returned extension. */
export const STORED_IMAGE_EXT = 'webp';

/**
 * Normalizes a validated upload into the one stored representation: a WebP,
 * downscaled so its width is at most `maxWidth` (never enlarged), with EXIF
 * orientation applied and all other metadata dropped (smaller, and no leaking
 * capture data). Animated GIFs become animated WebP.
 *
 * `maxWidth` defaults to the page-image profile (MEDIA_MAX_IMAGE_WIDTH); the
 * catalog upload passes a smaller width to derive its `thumb` variant.
 *
 * `square` centre-crops to a square first — what a category mark is stored as,
 * so the one place that decides its shape is the upload rather than every box
 * that later draws it. The side is capped by the shorter edge, so a square is
 * cropped from the picture rather than scaled up out of it.
 */
export async function processImage(
  bytes: Buffer,
  mime: AcceptedImageMime,
  maxWidth: number = MEDIA_MAX_IMAGE_WIDTH,
  square = false,
): Promise<Buffer> {
  const animated = mime === 'image/gif';
  const image = sharp(bytes, { animated }).rotate(); // bake in EXIF orientation
  if (!square) {
    return image
      .resize({ width: maxWidth, withoutEnlargement: true })
      .webp()
      .toBuffer();
  }

  // Metadata describes the input, so a portrait photo that EXIF rotates to
  // landscape reports its edges swapped — the shorter of the two is the same
  // number either way, which is all the side length needs.
  const meta = await sharp(bytes, { animated }).metadata();
  const height = (animated ? meta.pageHeight : meta.height) ?? maxWidth;
  const side = Math.min(maxWidth, meta.width ?? maxWidth, height);
  return image
    .resize({ width: side, height: side, fit: 'cover', position: 'centre' })
    .webp()
    .toBuffer();
}
