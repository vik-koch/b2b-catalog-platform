import {
  Body,
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  CatalogSyncPreviewResponse,
  SYNC_MAX_UPLOAD_BYTES,
  catalogSyncOptionsSchema,
} from '@b2b-catalog-platform/shared/core/exchange';
import { AuthUser } from '@b2b-catalog-platform/shared/platform';
import { CatalogSyncService } from '../../core/exchange/catalog-sync.service';
import { Auth } from '../../platform/auth/auth.decorator';
import { CurrentUser } from '../../platform/auth/current-user.decorator';
import { parseCatalogSyncCsv } from './catalog-sync-csv';
import { readSyncUpload } from './sync-upload';

/**
 * A catalog file's preview (FR-ADM-02). Admin-only, where the run routes are
 * shared with a manager: the catalog is an admin's work by hand. Multipart,
 * so not a contract route; the response shape still comes from the contract.
 */
@Auth('admin')
@Controller()
export class CatalogSyncController {
  constructor(private readonly service: CatalogSyncService) {}

  /** Stages the parsed rows on a run; a separate commit applies them. */
  @Post('admin/sync/preview')
  @UseInterceptors(
    // Multer cuts an oversized body off before it is fully buffered.
    FileInterceptor('file', { limits: { fileSize: SYNC_MAX_UPLOAD_BYTES } }),
  )
  async preview(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body('options') rawOptions: string | undefined,
    @CurrentUser() user: AuthUser,
  ): Promise<CatalogSyncPreviewResponse> {
    const { options, parsed, filename } = readSyncUpload(
      file,
      rawOptions,
      catalogSyncOptionsSchema,
      parseCatalogSyncCsv,
    );
    return this.service.preview(
      parsed.rows,
      options,
      filename,
      user,
      parsed.errors,
    );
  }
}
