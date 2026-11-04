import {
  Controller,
  Inject,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { MEDIA_MAX_UPLOAD_BYTES } from '@b2b-catalog-platform/shared/platform';
import { UploadMediaResponse } from '@b2b-catalog-platform/shared/admin/platform';
import { Auth } from '../../platform/auth/auth.decorator';
import { MEDIA_STORE, MediaStore } from '../../platform/media/media-store';
import { readImageUpload } from '../../platform/media/image-upload';
import {
  processImage,
  STORED_IMAGE_EXT,
} from '../../platform/media/image-processing';

/**
 * An image for a page body. Multipart, so no oRPC contract; the response shape
 * still lives in shared. The client's type, name and size are all untrusted.
 */
@Controller('media')
export class MediaController {
  constructor(@Inject(MEDIA_STORE) private readonly store: MediaStore) {}

  @Auth('admin')
  @Post()
  // In memory, to sniff and hash the bytes; the limit refuses an oversized
  // body before it is buffered.
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MEDIA_MAX_UPLOAD_BYTES } }),
  )
  async upload(
    @UploadedFile() file: Express.Multer.File | undefined,
  ): Promise<UploadMediaResponse> {
    const { mime, bytes } = await readImageUpload(file);
    const processed = await processImage(bytes, mime);
    return this.store.put({ bytes: processed, ext: STORED_IMAGE_EXT });
  }
}
