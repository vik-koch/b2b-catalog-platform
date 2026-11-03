import {
  DOCUMENT_FILE_NAME_MAX_LENGTH,
  DOCUMENT_MAX_UPLOAD_BYTES,
} from '../../platform/media-constants';

/**
 * The documents an order can carry (FR-ORD-05, ADR 0052). Payment
 * instructions are only ever supplied; the summary is generated unless a file
 * replaces it.
 */
export const ORDER_DOCUMENT_KINDS = [
  'payment-instructions',
  'order-summary',
] as const;
export type OrderDocumentKind = (typeof ORDER_DOCUMENT_KINDS)[number];

/** Under the API's prefix, not the public `/documents`: these name a customer. */
const ORDER_DOCUMENT_PATH = '/api/order-documents';

/** A product document's cap: the same kind of file through the same sniffing. */
export const ORDER_DOCUMENT_MAX_UPLOAD_BYTES = DOCUMENT_MAX_UPLOAD_BYTES;
export const ORDER_DOCUMENT_FILE_NAME_MAX_LENGTH =
  DOCUMENT_FILE_NAME_MAX_LENGTH;

/**
 * Where one document is fetched from: by a session that may read the order, or
 * by a mailed link's token (FR-NOTIF-06). The way in decides which version a
 * summary is drawn from.
 */
export function orderDocumentPath(
  kind: OrderDocumentKind,
  by: { reference: string } | { token: string },
): string {
  const where =
    'token' in by
      ? `by-token/${encodeURIComponent(by.token)}`
      : encodeURIComponent(by.reference);
  return `${ORDER_DOCUMENT_PATH}/${where}/${kind}`;
}

/** The reference in the name: `document.pdf` is a file nobody can place. */
export function generatedSummaryFileName(reference: string): string {
  return `${reference}.pdf`;
}
