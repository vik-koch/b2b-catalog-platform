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
  AcceptedImageMime,
  DOCUMENT_FILE_NAME_MAX_LENGTH,
  DOCUMENT_MAX_UPLOAD_BYTES,
  MEDIA_CATALOG_FULL_WIDTH,
  MEDIA_CATALOG_THUMB_WIDTH,
  MEDIA_MAX_UPLOAD_BYTES,
  UploadCatalogImageResponse,
  UploadDocumentResponse,
  UploadMediaResponse,
} from '@b2b-catalog-platform/shared';
import { Auth } from '../auth/auth.decorator';
import { MEDIA_STORE, MediaStore } from './media-store';
import {
  documentExtension,
  sniffAcceptedDocument,
} from './document-content-type';
import { sniffAcceptedImage } from './image-content-type';
import { processImage, STORED_IMAGE_EXT } from './image-processing';

/**
 * Upload endpoint for images and product documents. Not an oRPC contract: the
 * payload is
 * multipart/form-data (raw bytes), which the JSON-oriented contracts do not
 * model. The response shapes still live in shared (UploadMediaResponse and its
 * neighbours) so the editor and this handler agree.
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
    const { mime, validatedFile } = await this.validate(file);

    // Re-encode to a single capped WebP, then store by content hash.
    const processed = await processImage(validatedFile.buffer, mime);
    return this.store.put({ bytes: processed, ext: STORED_IMAGE_EXT });
  }

  /**
   * Catalog image upload: derives two independently content-addressed WebPs
   * from one upload — a `full` at MEDIA_CATALOG_FULL_WIDTH and a `thumb`
   * at MEDIA_CATALOG_THUMB_WIDTH — and returns the `{ full, thumb }` pair.
   */
  @Auth('admin')
  @Post('catalog')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MEDIA_MAX_UPLOAD_BYTES } }),
  )
  async uploadCatalogImage(
    @UploadedFile() file: Express.Multer.File | undefined,
  ): Promise<UploadCatalogImageResponse> {
    const { mime, validatedFile } = await this.validate(file);

    const [fullBytes, thumbBytes] = await Promise.all([
      processImage(validatedFile.buffer, mime, MEDIA_CATALOG_FULL_WIDTH),
      processImage(validatedFile.buffer, mime, MEDIA_CATALOG_THUMB_WIDTH),
    ]);
    const [full, thumb] = await Promise.all([
      this.store.put({ bytes: fullBytes, ext: STORED_IMAGE_EXT }),
      this.store.put({ bytes: thumbBytes, ext: STORED_IMAGE_EXT }),
    ]);
    return { full: full.url, thumb: thumb.url };
  }

  /**
   * Document upload (FR-DOC-01). The bytes are stored exactly as received —
   * re-encoding a certificate destroys it — so this route shares only the gate
   * with the image ones: presence, its own larger size cap, and a sniff over
   * its own allowlist.
   *
   * The whole stored file comes back, not just a URL: the stored name is a
   * content hash, so the name it arrived under, its real type and its size are
   * what make it recognisable in the form that is about to save it.
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
      // The client's filename, truncated rather than trusted: it is shown back
      // to the admin and nothing resolves by it.
      name: file.originalname.slice(0, DOCUMENT_FILE_NAME_MAX_LENGTH),
      contentType: mime,
      byteSize: file.size,
    };
  }

  /**
   * The shared, server-side upload gate: presence, size cap, and — decisively —
   * content sniffing over the client's declared type, so a renamed SVG or
   * non-image is rejected here rather than served same-origin. Returns the
   * sniffed mime; throws the matching 4xx otherwise.
   */
  private async validate(
    file: Express.Multer.File | undefined,
  ): Promise<{ mime: AcceptedImageMime; validatedFile: Express.Multer.File }> {
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
    return { mime, validatedFile: file };
  }
}
