import {
  BadRequestException,
  Controller,
  ForbiddenException,
  PayloadTooLargeException,
  Post,
  UploadedFile,
  UseInterceptors,
  Body,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Implement, implement } from '@orpc/nest';
import {
  AuthUser,
  SYNC_MAX_UPLOAD_BYTES,
  SyncArea,
  SyncPreviewResponse,
  UserRole,
  syncContract,
  syncOptionsSchema,
} from '@b2b-catalog-platform/shared';
import { Auth } from '../auth/auth.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { refusals } from '../orpc/refusals';
import { SyncFormatError, parseSyncCsv } from './sync-csv';
import { SyncService } from './sync.service';

/**
 * Which areas' runs a role may read (FR-ADM-09).
 *
 * | role    | catalog | customers |
 * | ------- | ------- | --------- |
 * | admin   | yes     | yes       |
 * | manager | no      | yes       |
 * | user    | no      | no        |
 *
 * An area's log is readable by whoever may do that area's work by hand: the
 * catalog is an admin's, a customer account is a manager's too. Written as a
 * `Record<UserRole, …>` for the reason the work counts are — a new role has to
 * name its areas to compile, and an area named by nobody is simply refused,
 * which is the safe direction to fail in.
 *
 * It is a check in the handler rather than a guard because the rule is about
 * the *run*, not the route: the list is narrowed by an area in the query, and
 * a run's own page is one route serving every area (ADR 0060). The guard above
 * still does the coarse half — nobody but staff reaches either.
 */
const READABLE_AREAS: Record<UserRole, readonly SyncArea[]> = {
  admin: ['catalog', 'customers'],
  manager: ['customers'],
  user: [],
};

/**
 * The bulk-sync surface. Admin-only, except the two reads a manager shares.
 *
 * The preview *upload* is not a contract route: it is multipart/form-data,
 * which the JSON contracts do not model — the same split the media upload uses.
 * Its response shape still comes from the shared contract, so the admin UI and
 * this handler cannot drift, and its refusals travel in the same envelope as
 * every other one. Commit, fetch and list are ordinary contract routes.
 */
@Auth('admin')
@Controller()
export class SyncController {
  constructor(private readonly service: SyncService) {}

  /**
   * Upload a catalog file and get back what it *would* change. Writes nothing
   * to the catalog: the parsed rows are staged on a run, which a separate
   * commit applies.
   */
  @Post('admin/sync/preview')
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
  ): Promise<SyncPreviewResponse> {
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
      parsed = parseSyncCsv(file.buffer.toString('utf8'));
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

  @Implement(syncContract.commitRun)
  commitRun(@CurrentUser() user: AuthUser) {
    return implement(syncContract.commitRun)
      .use(refusals)
      .handler(({ input: { params } }) =>
        this.service.commit(params.id, { id: user.id, email: user.email }),
      );
  }

  @Implement(syncContract.discardRun)
  discardRun(@CurrentUser() user: AuthUser) {
    return implement(syncContract.discardRun)
      .use(refusals)
      .handler(({ input: { params } }) =>
        this.service.discard(params.id, { id: user.id, email: user.email }),
      );
  }

  /**
   * One run, whatever area it belongs to — the area is read off the run and
   * checked against the reader, so a mailed link to a staged run works for
   * whoever was asked to answer it and for nobody else.
   */
  @Auth('admin', 'manager')
  @Implement(syncContract.getRun)
  getRun(@CurrentUser() user: AuthUser) {
    return implement(syncContract.getRun)
      .use(refusals)
      .handler(async ({ input: { params } }) => {
        const result = await this.service.getRun(params.id);
        this.assertMayRead(user, result.run.area);
        return result;
      });
  }

  @Auth('admin', 'manager')
  @Implement(syncContract.listRuns)
  listRuns(@CurrentUser() user: AuthUser) {
    return implement(syncContract.listRuns)
      .use(refusals)
      .handler(({ input: { query } }) => {
        this.assertMayRead(user, query.area);
        return this.service.listRuns(query.page, query.area, query.status);
      });
  }

  private assertMayRead(user: AuthUser, area: SyncArea): void {
    if (!READABLE_AREAS[user.role].includes(area)) {
      throw new ForbiddenException({
        code: 'insufficient-role',
        message: 'This area of the sync log is not yours to read',
      });
    }
  }

  /**
   * The options are validated by the same schema the JSON path would use, so
   * the delete gate (`softDeleteMissingProducts` requires
   * `productSetAuthoritative`) is enforced here too rather than only in the UI.
   */
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
    const result = syncOptionsSchema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException({
        code: 'options-invalid',
        message: result.error.issues.map((i) => i.message).join('; '),
      });
    }
    return result.data;
  }
}
