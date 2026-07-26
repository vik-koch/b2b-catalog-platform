import sharp from 'sharp';
import {
  AcceptedImageMime,
  MEDIA_MAX_IMAGE_WIDTH,
} from '@b2b-catalog-platform/shared';

/** The single stored format for page images; also the returned extension. */
export const STORED_IMAGE_EXT = 'webp';

/**
 * Normalizes a validated upload into the one stored representation: a WebP,
 * downscaled so its width is at most MEDIA_MAX_IMAGE_WIDTH (never enlarged),
 * with EXIF orientation applied and all other metadata dropped (smaller, and
 * no leaking capture data). Animated GIFs become animated WebP.
 */
export async function processImage(
  bytes: Buffer,
  mime: AcceptedImageMime,
): Promise<Buffer> {
  const animated = mime === 'image/gif';
  return sharp(bytes, { animated })
    .rotate() // bake in EXIF orientation before it is stripped
    .resize({ width: MEDIA_MAX_IMAGE_WIDTH, withoutEnlargement: true })
    .webp()
    .toBuffer();
}
