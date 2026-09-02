import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { DOCUMENT, inject, Injectable } from '@angular/core';
import { lastValueFrom } from 'rxjs';
import {
  SyncCommitCode,
  SyncCommitResponse,
  SyncFormatErrorBody,
  syncFormatErrorSchema,
  SyncOptions,
  SyncPreviewResponse,
  syncContract,
} from '@b2b-catalog-platform/shared';
import { safe } from '@orpc/client';
import { createOrpcClient } from '../../core/orpc-client';

/**
 * A preview the server refused — a malformed file, a file too large, or refused
 * options. `failure` carries the code and the names from the admin's own file;
 * the page turns it into a sentence out of the admin text.
 */
export type PreviewResult =
  | { ok: true; preview: SyncPreviewResponse }
  | { ok: false; failure: SyncFormatErrorBody | null };

/** A commit that could not be applied (already applied, or its rows expired). */
export type CommitResult =
  | { ok: true; result: SyncCommitResponse }
  | { ok: false; code: SyncCommitCode };

/**
 * The bulk-sync client. The upload is multipart, so it goes through HttpClient
 * directly (like the media upload) while commit and the run history use the
 * contract client; both halves share the contract's types, so the screen never
 * restates a shape.
 *
 * The server's rejections are returned as typed results rather than thrown:
 * a bad file and a refused option combination are things the admin fixes and
 * retries, not application errors.
 */
@Injectable({ providedIn: 'root' })
export class SyncService {
  private readonly http = inject(HttpClient);
  private readonly document = inject(DOCUMENT);
  private readonly client = createOrpcClient(syncContract);

  /** Uploads a file and returns what it would change. Writes nothing. */
  async preview(file: File, options: SyncOptions): Promise<PreviewResult> {
    const form = new FormData();
    form.append('file', file);
    form.append('options', JSON.stringify(options));
    const url = `${this.document.location.origin}/api/admin/sync/preview`;

    try {
      const preview = await lastValueFrom(
        this.http.post<SyncPreviewResponse>(url, form),
      );
      return { ok: true, preview };
    } catch (error) {
      // 413 comes from the size guard, which the browser cannot pre-empt for a
      // file picked before the limit is known; both are the admin's to fix.
      if (
        error instanceof HttpErrorResponse &&
        (error.status === 400 || error.status === 413)
      ) {
        // A body that does not parse is a proxy's error page, not the API's;
        // null lands on the page's generic wording rather than throwing.
        const parsed = syncFormatErrorSchema.safeParse(error.error);
        return { ok: false, failure: parsed.success ? parsed.data : null };
      }
      throw error;
    }
  }

  /** Applies a previewed run. */
  async commit(id: string): Promise<CommitResult> {
    const result = await safe(this.client.commitRun({ params: { id } }));

    if (result.isSuccess) return { ok: true, result: result.data };
    // The session refusals are the guards' to answer, not this screen's.
    if (
      result.isDefined &&
      result.error.code !== 'not-authenticated' &&
      result.error.code !== 'insufficient-role'
    ) {
      return { ok: false, code: result.error.code };
    }
    throw result.error;
  }

  listRuns(page = 1) {
    return this.client.listRuns({ query: { page } });
  }
}
