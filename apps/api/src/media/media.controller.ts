import {
  BadRequestException,
  Controller,
  Inject,
  PayloadTooLargeException,
  Post,
  UnsupportedMediaTypeException,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  MEDIA_MAX_UPLOAD_BYTES,
  UploadMediaResponse,
} from '@b2b-catalog-platform/shared';
import { Auth } from '../auth/auth.decorator';
import { MEDIA_STORE, MediaStore } from './media-store';
import { sniffAcceptedImage } from './image-content-type';
import { processImage, STORED_IMAGE_EXT } from './image-processing';

/**
 * Image upload endpoint. Not a ts-rest contract: the payload is
 * multipart/form-data (raw bytes), which the JSON-oriented contracts do not
 * model. The response shape still lives in shared (UploadMediaResponse) so the
 * editor and this handler agree.
 *
 * Admin-only. Every check here is server-side and deliberate: the client's
 * Content-Type, filename and size claims are all untrusted. Alt text is not the
 * asset's concern — the editor sets it on the `<img>` node, and it is stored
 * with the page body.
 */
@Controller('media')
export class MediaController {
  constructor(@Inject(MEDIA_STORE) private readonly store: MediaStore) {}

  @Auth('admin')
  @Post()
  // memoryStorage: we need the bytes in memory to sniff and hash them; the
  // client's filename never touches disk. The limit is a hard multer-level
  // cutoff so oversized bodies are refused before buffering completes.
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MEDIA_MAX_UPLOAD_BYTES } }),
  )
  async upload(
    @UploadedFile() file: Express.Multer.File | undefined,
  ): Promise<UploadMediaResponse> {
    if (!file) {
      throw new BadRequestException('No file uploaded (field "file")');
    }
    if (file.size > MEDIA_MAX_UPLOAD_BYTES) {
      throw new PayloadTooLargeException('Image exceeds the size limit');
    }

    // Content sniffing over the declared type: a renamed SVG or non-image is
    // rejected here, not served same-origin.
    const mime = await sniffAcceptedImage(file.buffer);
    if (!mime) {
      throw new UnsupportedMediaTypeException(
        'Unsupported image type (allowed: PNG, JPEG, WebP, GIF)',
      );
    }

    // Re-encode to a single capped WebP, then store by content hash.
    const processed = await processImage(file.buffer, mime);
    return this.store.put({ bytes: processed, ext: STORED_IMAGE_EXT });
  }
}
