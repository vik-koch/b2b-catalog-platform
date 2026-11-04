import { HttpClient } from '@angular/common/http';
import { DOCUMENT, inject, Injectable } from '@angular/core';
import { lastValueFrom } from 'rxjs';
import { UploadCatalogImageResponse } from '@b2b-catalog-platform/shared/admin/catalog';

/** Catalog pictures, multipart, so not through the oRPC client. */
@Injectable({ providedIn: 'root' })
export class CatalogUploadsService {
  private readonly http = inject(HttpClient);
  private readonly document = inject(DOCUMENT);

  /**
   * A product or category picture as the stored `{ full, thumb }` pair.
   * `square` asks for the centre-cropped category mark; the server crops.
   */
  async uploadImage(
    file: File,
    square = false,
  ): Promise<UploadCatalogImageResponse> {
    const form = new FormData();
    form.append('file', file);
    const path = square ? '/api/media/catalog/square' : '/api/media/catalog';
    const url = `${this.document.location.origin}${path}`;
    return lastValueFrom(this.http.post<UploadCatalogImageResponse>(url, form));
  }
}
