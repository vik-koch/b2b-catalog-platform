import { HttpClient } from '@angular/common/http';
import { DOCUMENT, inject, Injectable } from '@angular/core';
import { lastValueFrom } from 'rxjs';
import {
  DOCUMENT_ERROR_CODES,
  DocumentErrorCode,
  DocumentInput,
  ProductDocument,
  UploadDocumentResponse,
} from '@b2b-catalog-platform/shared';
import { safe, type ClientPromiseResult } from '@orpc/client';
import { documentsContract } from '../../core/contract-routes.generated';
import { createOrpcClient } from '../../core/orpc-client';

/**
 * A save or delete the server refused. The refusal travels as the API's own
 * code and the screen looks its wording up in the admin text, so nothing the
 * server wrote reaches a customer-facing string.
 */
export type DocumentResult =
  | { ok: true; document: ProductDocument }
  | { ok: false; code: DocumentErrorCode };

/** The auth refusals every route declares are the guards' to answer, not a
 * form's; only the document codes have wording here. */
function isDocumentCode(code: string): code is DocumentErrorCode {
  return (DOCUMENT_ERROR_CODES as readonly string[]).includes(code);
}

/**
 * The product-document admin client (FR-DOC-01).
 *
 * Two transports, on purpose: the row is JSON over the oRPC client, and the
 * file is multipart — which the JSON-oriented contracts do not model — posted
 * straight to the upload endpoint, exactly as a catalog image is. Same-origin,
 * so the httpOnly session cookie rides along with no credentials flag.
 */
@Injectable({ providedIn: 'root' })
export class DocumentsService {
  private readonly client = createOrpcClient(documentsContract);
  private readonly http = inject(HttpClient);
  private readonly document = inject(DOCUMENT);

  async list(): Promise<ProductDocument[]> {
    return (await this.client.listDocuments()).documents;
  }

  /** One document, for the editor — a route, so a reload has no list to read
   * from. `undefined` is a 404: deleted while the tab sat open. */
  async get(id: string): Promise<ProductDocument | undefined> {
    const result = await safe(this.client.getDocument({ params: { id } }));
    if (result.isDefined && result.error.code === 'document-not-found') {
      return undefined;
    }
    if (!result.isSuccess) throw result.error;
    return result.data;
  }

  /** Stores the bytes and hands back the file the form will save. The stored
   * name is a content hash, so what comes back carries the name it went up
   * under, its sniffed type and its size. */
  uploadFile(file: File): Promise<UploadDocumentResponse> {
    const form = new FormData();
    form.append('file', file);
    const url = `${this.document.location.origin}/api/media/document`;
    return lastValueFrom(this.http.post<UploadDocumentResponse>(url, form));
  }

  create(body: DocumentInput): Promise<DocumentResult> {
    return this.act(this.client.createDocument({ body }));
  }

  update(id: string, body: DocumentInput): Promise<DocumentResult> {
    return this.act(this.client.updateDocument({ params: { id }, body }));
  }

  async remove(
    id: string,
  ): Promise<{ ok: true } | { ok: false; code: DocumentErrorCode }> {
    const { error, isDefined } = await safe(
      this.client.deleteDocument({ params: { id } }),
    );
    if (isDefined && isDocumentCode(error.code)) {
      return { ok: false, code: error.code };
    }
    if (error) throw error;
    return { ok: true };
  }

  /** The one shape both writes share: the row, or a code the screen can phrase. */
  private async act<TError extends Error>(
    call: ClientPromiseResult<ProductDocument, TError>,
  ): Promise<DocumentResult> {
    const result = await safe(call);
    if (result.isDefined && isDocumentCode(result.error.code)) {
      return { ok: false, code: result.error.code };
    }
    if (!result.isSuccess) throw result.error;
    return { ok: true, document: result.data };
  }
}
