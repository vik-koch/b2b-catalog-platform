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
  UploadCatalogImageResponse,
  UploadDocumentResponse,
} from '@b2b-catalog-platform/shared/admin/catalog';
import {
  DOCUMENT_FILE_NAME_MAX_LENGTH,
  DOCUMENT_MAX_UPLOAD_BYTES,
  MEDIA_CATALOG_FULL_WIDTH,
  MEDIA_CATALOG_THUMB_WIDTH,
  MEDIA_MAX_UPLOAD_BYTES,
} from '@b2b-catalog-platform/shared/platform';

import { Auth } from '../../../platform/auth/auth.decorator';
import {
  documentExtension,
  sniffAcceptedDocument,
} from '../../../platform/media/document-content-type';
import {
  processImage,
  STORED_IMAGE_EXT,
} from '../../../platform/media/image-processing';
import { readImageUpload } from '../../../platform/media/image-upload';
import { MEDIA_STORE, MediaStore } from '../../../platform/media/media-store';

/** The catalog's uploads: product and category pictures, and documents. */
@Controller('media')
export class CatalogUploadsController {
  constructor(@Inject(MEDIA_STORE) private readonly store: MediaStore) {}

  /** A `full` and a `thumb`, each stored by its own hash. */
  @Auth('admin')
  @Post('catalog')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MEDIA_MAX_UPLOAD_BYTES } }),
  )
  async uploadCatalogImage(
    @UploadedFile() file: Express.Multer.File | undefined,
  ): Promise<UploadCatalogImageResponse> {
    return this.storeCatalogImage(file, false);
  }

  /** Centre-cropped to a square: a category mark (FR-CAT-07). Cropped here,
   * because the cropped picture is what everything afterwards reads. */
  @Auth('admin')
  @Post('catalog/square')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MEDIA_MAX_UPLOAD_BYTES } }),
  )
  async uploadSquareCatalogImage(
    @UploadedFile() file: Express.Multer.File | undefined,
  ): Promise<UploadCatalogImageResponse> {
    return this.storeCatalogImage(file, true);
  }

  /**
   * A document (FR-DOC-01), stored exactly as received: re-encoding a
   * certificate destroys it. Its own size cap and type allowlist.
   */
  @Auth('admin')
  @Post('document')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: DOCUMENT_MAX_UPLOAD_BYTES },
    }),
  )
  async uploadDocument(
    @UploadedFile() file: Express.Multer.File | undefined,
  ): Promise<UploadDocumentResponse> {
    if (!file) {
      throw new BadRequestException('No file uploaded (field "file")');
    }
    if (file.size > DOCUMENT_MAX_UPLOAD_BYTES) {
      throw new PayloadTooLargeException('Document exceeds the size limit');
    }
    const mime = await sniffAcceptedDocument(file.buffer);
    if (!mime) {
      throw new UnsupportedMediaTypeException(
        'Unsupported document type (allowed: PDF, PNG, JPEG, WebP, GIF)',
      );
    }
    const stored = await this.store.putDocument({
      bytes: file.buffer,
      ext: documentExtension(mime),
    });
    return {
      url: stored.url,
      // Truncated, not trusted: it is only shown back to the admin.
      name: file.originalname.slice(0, DOCUMENT_FILE_NAME_MAX_LENGTH),
      contentType: mime,
      byteSize: file.size,
    };
  }

  private async storeCatalogImage(
    file: Express.Multer.File | undefined,
    square: boolean,
  ): Promise<UploadCatalogImageResponse> {
    const { mime, bytes } = await readImageUpload(file);
    const [fullBytes, thumbBytes] = await Promise.all([
      processImage(bytes, mime, MEDIA_CATALOG_FULL_WIDTH, square),
      processImage(bytes, mime, MEDIA_CATALOG_THUMB_WIDTH, square),
    ]);
    const [full, thumb] = await Promise.all([
      this.store.put({ bytes: fullBytes, ext: STORED_IMAGE_EXT }),
      this.store.put({ bytes: thumbBytes, ext: STORED_IMAGE_EXT }),
    ]);
    return { full: full.url, thumb: thumb.url };
  }
}
