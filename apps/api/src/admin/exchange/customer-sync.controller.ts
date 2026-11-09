import {
  Body,
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';

import {
  customerSyncOptionsSchema,
  CustomerSyncPreviewResponse,
  SYNC_MAX_UPLOAD_BYTES,
} from '@b2b-catalog-platform/shared/core/exchange';
import { AuthUser } from '@b2b-catalog-platform/shared/platform';

import { CustomerSyncService } from '../../core/exchange/customer-sync.service';
import { Auth } from '../../platform/auth/auth.decorator';
import { CurrentUser } from '../../platform/auth/current-user.decorator';
import { parseCustomerSyncCsv } from './customer-sync-csv';
import { readSyncUpload } from './sync-upload';

/**
 * A customer file's preview (FR-ADM-12). Admin-only, though a manager may
 * answer the staged run: bringing accounts into being from a file is a
 * deployment act. Multipart, so not a contract route.
 */
@Auth('admin')
@Controller()
export class CustomerSyncController {
  constructor(private readonly service: CustomerSyncService) {}

  /** Stages the parsed rows on a run; a separate commit applies them. */
  @Post('admin/sync/customers/preview')
  @UseInterceptors(
    // Multer cuts an oversized body off before it is fully buffered.
    FileInterceptor('file', { limits: { fileSize: SYNC_MAX_UPLOAD_BYTES } }),
  )
  async preview(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body('options') rawOptions: string | undefined,
    @CurrentUser() user: AuthUser,
  ): Promise<CustomerSyncPreviewResponse> {
    const { options, parsed, filename } = readSyncUpload(
      file,
      rawOptions,
      customerSyncOptionsSchema,
      parseCustomerSyncCsv,
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
