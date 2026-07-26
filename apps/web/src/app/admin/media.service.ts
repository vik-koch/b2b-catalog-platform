import { HttpClient } from '@angular/common/http';
import { DOCUMENT, inject, Injectable } from '@angular/core';
import { lastValueFrom } from 'rxjs';
import { UploadMediaResponse } from '@b2b-catalog-platform/shared';

/**
 * Uploads editor images to the admin media endpoint. Multipart, so it does not
 * go through the ts-rest client (which models JSON). Browser-only — the editor
 * that calls it never runs on the server. Same-origin, so the httpOnly session
 * cookie rides along without any credentials flag.
 */
@Injectable({ providedIn: 'root' })
export class MediaService {
  private readonly http = inject(HttpClient);
  private readonly document = inject(DOCUMENT);

  /** Returns the stored image's stable `/media/...` URL. */
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
