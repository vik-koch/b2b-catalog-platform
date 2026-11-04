import {
  BadRequestException,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import {
  AcceptedImageMime,
  MEDIA_MAX_UPLOAD_BYTES,
} from '@b2b-catalog-platform/shared/platform';
import { sniffAcceptedImage } from './image-content-type';

/**
 * The gate every image upload passes: presence, the size cap, and the type
 * sniffed from the bytes rather than claimed by the client, so a renamed SVG
 * is refused before it could be served same-origin.
 */
export async function readImageUpload(
  file: Express.Multer.File | undefined,
): Promise<{ mime: AcceptedImageMime; bytes: Buffer }> {
  if (!file) {
    throw new BadRequestException('No file uploaded (field "file")');
  }
  if (file.size > MEDIA_MAX_UPLOAD_BYTES) {
    throw new PayloadTooLargeException('Image exceeds the size limit');
  }
  const mime = await sniffAcceptedImage(file.buffer);
  if (!mime) {
    throw new UnsupportedMediaTypeException(
      'Unsupported image type (allowed: PNG, JPEG, WebP, GIF)',
    );
  }
  return { mime, bytes: file.buffer };
}
