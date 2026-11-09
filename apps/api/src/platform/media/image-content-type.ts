import sharp from 'sharp';

import { AcceptedImageMime } from '@b2b-catalog-platform/shared/platform';

const FORMAT_TO_MIME: Record<string, AcceptedImageMime> = {
  png: 'image/png',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
};

/** The type sharp decodes the bytes as, or null off the allowlist; sharp also
 * re-encodes, so one library decides what the bytes are. */
export async function sniffAcceptedImage(
  bytes: Buffer,
): Promise<AcceptedImageMime | null> {
  let format: string | undefined;
  try {
    format = (await sharp(bytes).metadata()).format;
  } catch {
    return null;
  }
  return (format && FORMAT_TO_MIME[format]) || null;
}
