import { HttpClient } from '@angular/common/http';
import { DOCUMENT, inject, Injectable } from '@angular/core';
import { lastValueFrom } from 'rxjs';
import {
  DocumentDetail,
  DocumentErrorCode,
  DocumentInput,
  ProductDocument,
} from '@b2b-catalog-platform/shared/admin/catalog';
import { UploadDocumentResponse } from '@b2b-catalog-platform/shared/admin';
import { safe, type ClientPromiseResult } from '@orpc/client';
import { documentsContract } from '../../contract-routes.generated';
import { createOrpcClient } from '../../../shared/core/orpc-client';
import { renderable } from '../../../shared/core/renderable';

export type DocumentResult =
  | { ok: true; document: ProductDocument }
  | { ok: false; code: DocumentErrorCode };

/**
 * The product-document client (FR-DOC-01). The row goes over oRPC, the file
 * as multipart straight to the upload endpoint, as a catalog image does: the
 * contracts model JSON only.
 */
@Injectable({ providedIn: 'root' })
export class DocumentsService {
  private readonly client = createOrpcClient(documentsContract);
  private readonly http = inject(HttpClient);
  private readonly document = inject(DOCUMENT);

  async list(): Promise<ProductDocument[]> {
    return (await this.client.listDocuments()).documents;
  }

  /** `undefined` when it was deleted while the tab sat open. */
  async get(id: string): Promise<DocumentDetail | undefined> {
    const result = await safe(this.client.getDocument({ params: { id } }));
    if (result.isDefined && result.error.code === 'document-not-found') {
      return undefined;
    }
    if (!result.isSuccess) throw result.error;
    return result.data;
  }

  /** The stored name is a content hash, so the answer carries the name it
   * went up under, its sniffed type and its size. */
  uploadFile(file: File): Promise<UploadDocumentResponse> {
    const form = new FormData();
    form.append('file', file);
    const url = `${this.document.location.origin}/api/media/document`;
    return lastValueFrom(this.http.post<UploadDocumentResponse>(url, form));
  }

  create(body: DocumentInput): Promise<DocumentResult> {
    return this.saved(this.client.createDocument({ body }));
  }

  update(id: string, body: DocumentInput): Promise<DocumentResult> {
    return this.saved(this.client.updateDocument({ params: { id }, body }));
  }

  /** The stored row, or the code the server refused with. */
  private async saved<TError extends Error>(
    call: ClientPromiseResult<DocumentDetail, TError>,
  ): Promise<DocumentResult> {
    const result = await safe(call);
    if (result.isDefined && renderable(result.error.code)) {
      return { ok: false, code: result.error.code };
    }
    if (!result.isSuccess) throw result.error;
    return { ok: true, document: result.data };
  }

  async remove(
    id: string,
  ): Promise<{ ok: true } | { ok: false; code: DocumentErrorCode }> {
    const result = await safe(this.client.deleteDocument({ params: { id } }));
    if (result.isDefined && renderable(result.error.code)) {
      return { ok: false, code: result.error.code };
    }
    if (!result.isSuccess) throw result.error;
    return { ok: true };
  }
}
