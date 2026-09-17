import {
  BadRequestException,
  Body,
  Controller,
  PayloadTooLargeException,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  AuthUser,
  CustomerSyncPreviewResponse,
  SYNC_MAX_UPLOAD_BYTES,
  customerSyncOptionsSchema,
} from '@b2b-catalog-platform/shared';
import { Auth } from '../auth/auth.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { SyncFormatError } from './csv-file';
import { parseCustomerSyncCsv } from './customer-sync-csv';
import { CustomerSyncService } from './customer-sync.service';

/**
 * The operator's own way into the customer exchange: upload a file, read what
 * it would do to people's accounts (FR-ADM-12).
 *
 * **Admin-only**, where reading and answering a customer run are a manager's
 * too. The split is the one the whole area is drawn along: a manager works the
 * customers this shop has, and bringing several hundred accounts into being
 * from a file is a deployment act — the same class of thing as handing the area
 * over, which is also an admin's alone.
 *
 * Not a contract route: it is multipart/form-data, which the JSON contracts do
 * not model — the same split the catalog upload and the media upload use. Its
 * response shape still comes from the shared contract, and its refusals travel
 * in the same envelope as every other one.
 */
@Auth('admin')
@Controller()
export class CustomerSyncController {
  constructor(private readonly service: CustomerSyncService) {}

  /**
   * Upload a customer file and get back what it *would* do. Writes nothing:
   * the parsed rows are staged on a run, which a separate commit applies —
   * and which the run routes next door will let a manager apply, because by
   * then it is a staged customer run like any other.
   */
  @Post('admin/sync/customers/preview')
  // memoryStorage — the file is parsed in one pass and never stored; the limit
  // is a hard multer-level cutoff so an oversized body is refused before it is
  // fully buffered.
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: SYNC_MAX_UPLOAD_BYTES } }),
  )
  async preview(
    @UploadedFile() file: Express.Multer.File | undefined,
    // Multipart carries no JSON body, so the run's options travel as a JSON
    // string field alongside the file.
    @Body('options') rawOptions: string | undefined,
    @CurrentUser() user: AuthUser,
  ): Promise<CustomerSyncPreviewResponse> {
    if (!file) {
      throw new BadRequestException({
        code: 'no-file',
        message: 'No file uploaded (field "file")',
      });
    }
    if (file.size > SYNC_MAX_UPLOAD_BYTES) {
      throw new PayloadTooLargeException({
        code: 'file-too-large',
        message: 'The file exceeds the size limit',
        params: { limit: String(SYNC_MAX_UPLOAD_BYTES) },
      });
    }

    const options = this.parseOptions(rawOptions);

    let parsed;
    try {
      parsed = parseCustomerSyncCsv(file.buffer.toString('utf8'));
    } catch (error) {
      if (error instanceof SyncFormatError) {
        throw new BadRequestException({
          code: error.code,
          message: error.message,
          params: error.params,
        });
      }
      throw error;
    }

    return this.service.preview(
      parsed.rows,
      options,
      file.originalname ?? null,
      { id: user.id, email: user.email },
      parsed.errors,
    );
  }

  /** Validated by the same schema the headless path uses, so a file cannot
   * ask for an intent a submission could not. */
  private parseOptions(raw: string | undefined) {
    let value: unknown = {};
    if (raw) {
      try {
        value = JSON.parse(raw);
      } catch {
        throw new BadRequestException({
          code: 'options-invalid',
          message: 'The "options" field is not valid JSON',
        });
      }
    }
    const result = customerSyncOptionsSchema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException({
        code: 'options-invalid',
        message: result.error.issues.map((i) => i.message).join('; '),
      });
    }
    return result.data;
  }
}
