import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { DOCUMENT, inject, Injectable } from '@angular/core';
import { lastValueFrom } from 'rxjs';
import {
  SyncCommitResponse,
  SyncOptions,
  SyncPreviewResponse,
  syncContract,
} from '@b2b-catalog-platform/shared';
import { createApiClient } from '../../core/api-client';

/** A preview that the server refused — a malformed file, or refused options. */
export type PreviewResult =
  | { ok: true; preview: SyncPreviewResponse }
  | { ok: false; message: string };

/** A commit that could not be applied (already applied, or its rows expired). */
export type CommitResult =
  | { ok: true; result: SyncCommitResponse }
  | { ok: false; message: string };

/**
 * The bulk-sync client. The upload is multipart, so it goes through HttpClient
 * directly (like the media upload) while commit and the run history use the
 * ts-rest client; both halves share the contract's types, so the screen never
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
  private readonly client = createApiClient(syncContract);

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
      if (error instanceof HttpErrorResponse && error.status === 400) {
        return { ok: false, message: error.error?.message ?? '' };
      }
      throw error;
    }
  }

  /** Applies a previewed run. */
  async commit(id: string): Promise<CommitResult> {
    const response = await this.client.commitRun({ params: { id }, body: {} });
    if (response.status === 200) return { ok: true, result: response.body };
    if (response.status === 404 || response.status === 409) {
      return { ok: false, message: response.body.message };
    }
    throw new Error(`Failed to apply the sync (status ${response.status})`);
  }

  async listRuns(page = 1) {
    const response = await this.client.listRuns({ query: { page } });
    if (response.status === 200) return response.body;
    throw new Error(`Failed to list sync runs (status ${response.status})`);
  }
}
