import sharp from 'sharp';
import { AcceptedImageMime } from '@b2b-catalog-platform/shared';

// sharp reports the decoded format; map only the ones we allow to their MIME.
// Anything else (svg, tiff, avif, a non-image sharp cannot open) is rejected.
const FORMAT_TO_MIME: Record<string, AcceptedImageMime> = {
  png: 'image/png',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
};

/**
 * Determines the real image type by decoding the bytes with sharp, ignoring the
 * client's declared Content-Type and filename extension. Returns null for
 * anything off our allowlist — a renamed SVG, an exotic format, or a non-image
 * sharp refuses to parse. Using sharp (which also does the re-encoding) keeps
 * one library as the single authority on what these bytes actually are.
 */
export async function sniffAcceptedImage(
  bytes: Buffer,
): Promise<AcceptedImageMime | null> {
  let format: string | undefined;
  try {
    format = (await sharp(bytes).metadata()).format;
  } catch {
    return null; // not a decodable image
  }
  return (format && FORMAT_TO_MIME[format]) || null;
}
