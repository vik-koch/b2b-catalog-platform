import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { DOCUMENT, inject, Injectable } from '@angular/core';
import { safe } from '@orpc/client';
import { lastValueFrom } from 'rxjs';
import {
  CatalogSyncOptions,
  CatalogSyncPreviewResponse,
  CustomerSyncOptions,
  CustomerSyncPreviewResponse,
  SyncArea,
  SyncCommitResponse,
  SyncRun,
  SyncRunStatus,
} from '@b2b-catalog-platform/shared/core/exchange';
import {
  SyncCommitCode,
  SyncFormatErrorBody,
  syncFormatErrorSchema,
} from '@b2b-catalog-platform/shared/admin/exchange';
import { adminSyncContract } from './contract-routes.generated';
import { createOrpcClient } from '../../platform/orpc-client';
import { renderable } from '../../platform/renderable';

/** A preview, or the refusal the page words from its code; null for a body
 * that is not the API's. */
export type PreviewResult<T> =
  { ok: true; preview: T } | { ok: false; failure: SyncFormatErrorBody | null };

/** An action on a staged run, or why the run no longer allows it. */
export type RunActionResult<T> =
  ({ ok: true } & T) | { ok: false; code: SyncCommitCode };

/**
 * The sync client. The uploads are multipart, so they go through HttpClient;
 * the rest through the contract. Refusals come back as results, since the
 * admin fixes and retries them.
 */
@Injectable({ providedIn: 'root' })
export class SyncService {
  private readonly http = inject(HttpClient);
  private readonly document = inject(DOCUMENT);
  private readonly client = createOrpcClient(adminSyncContract);

  previewCatalog(
    file: File,
    options: CatalogSyncOptions,
  ): Promise<PreviewResult<CatalogSyncPreviewResponse>> {
    return this.upload('/api/admin/sync/preview', file, options);
  }

  /** Mails nobody: the links go out when the staged run is applied. */
  previewCustomers(
    file: File,
    options: CustomerSyncOptions,
  ): Promise<PreviewResult<CustomerSyncPreviewResponse>> {
    return this.upload('/api/admin/sync/customers/preview', file, options);
  }

  private async upload<T>(
    path: string,
    file: File,
    options: CatalogSyncOptions | CustomerSyncOptions,
  ): Promise<PreviewResult<T>> {
    const form = new FormData();
    form.append('file', file);
    form.append('options', JSON.stringify(options));
    const url = `${this.document.location.origin}${path}`;

    try {
      const preview = await lastValueFrom(this.http.post<T>(url, form));
      return { ok: true, preview };
    } catch (error) {
      // 409: the area was handed over since the screen loaded. 413: the size
      // guard, which the browser cannot pre-empt.
      if (
        error instanceof HttpErrorResponse &&
        (error.status === 400 || error.status === 409 || error.status === 413)
      ) {
        // A body that does not parse is a proxy's error page.
        const parsed = syncFormatErrorSchema.safeParse(error.error);
        return { ok: false, failure: parsed.success ? parsed.data : null };
      }
      throw error;
    }
  }

  async commit(
    id: string,
  ): Promise<RunActionResult<{ result: SyncCommitResponse }>> {
    const result = await safe(this.client.commitRun({ params: { id } }));
    if (result.isSuccess) return { ok: true, result: result.data };
    if (result.isDefined && renderable(result.error.code)) {
      return { ok: false, code: result.error.code };
    }
    throw result.error;
  }

  async discard(id: string): Promise<RunActionResult<{ run: SyncRun }>> {
    const result = await safe(this.client.discardRun({ params: { id } }));
    if (result.isSuccess) return { ok: true, run: result.data.run };
    if (result.isDefined && renderable(result.error.code)) {
      return { ok: false, code: result.error.code };
    }
    throw result.error;
  }

  listRuns(params: { area: SyncArea; page?: number; status?: SyncRunStatus }) {
    return this.client.listRuns({
      query: {
        page: params.page ?? 1,
        area: params.area,
        status: params.status,
      },
    });
  }

  /** The plan is recomputed while the run is staged, stored once it is
   * finished, and absent for a run that failed before it had one. */
  getRun(id: string) {
    return this.client.getRun({ params: { id } });
  }
}
