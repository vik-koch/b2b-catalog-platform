import { HttpClient } from '@angular/common/http';
import { DOCUMENT, inject, Injectable } from '@angular/core';
import { lastValueFrom } from 'rxjs';
import { UploadMediaResponse } from '@b2b-catalog-platform/shared/admin/platform';

/**
 * Images for a page body, multipart, so not through the oRPC client.
 * Same-origin, so the session cookie rides along without a credentials flag.
 */
@Injectable({ providedIn: 'root' })
export class MediaService {
  private readonly http = inject(HttpClient);
  private readonly document = inject(DOCUMENT);

  /** The stored image's stable `/media/...` URL. */
  async upload(file: File): Promise<string> {
    const form = new FormData();
    form.append('file', file);
    const url = `${this.document.location.origin}/api/media`;
    const response = await lastValueFrom(
      this.http.post<UploadMediaResponse>(url, form),
    );
    return response.url;
  }
}
