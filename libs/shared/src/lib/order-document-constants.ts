/**
 * Order-document limits and kinds (FR-ORD-05, ADR 0052). Plain data with no
 * Zod import, so a screen that needs one label does not pull the order
 * schemas along with it (see `document-constants.ts`).
 */

import {
  ACCEPTED_DOCUMENT_MIME_TYPES,
  DOCUMENT_FILE_NAME_MAX_LENGTH,
  DOCUMENT_MAX_UPLOAD_BYTES,
} from './document-constants';

/**
 * The two documents an order can carry.
 *
 * `payment-instructions` is only ever supplied — only the shop knows what it
 * says, and it exists only where the order is invoiced. `order-summary` is
 * generated from the version the reader is entitled to, unless a file has been
 * supplied in its place.
 */
export const ORDER_DOCUMENT_KINDS = [
  'payment-instructions',
  'order-summary',
] as const;
export type OrderDocumentKind = (typeof ORDER_DOCUMENT_KINDS)[number];

/** The kinds the platform can draw itself. The other one has to arrive. */
export const GENERATED_ORDER_DOCUMENT_KINDS: readonly OrderDocumentKind[] = [
  'order-summary',
];

/**
 * Where an order's documents are read from. Under the API's own prefix, not
 * the public `/documents` one: these name a customer, and are readable only
 * the three ways the order itself is (ADR 0052).
 */
export const ORDER_DOCUMENT_PATH = '/api/order-documents';

/** Same allowlist and cap as a product document: it is the same kind of file
 * arriving through the same sniffing, and nothing re-encodes either. */
export const ACCEPTED_ORDER_DOCUMENT_MIME_TYPES = ACCEPTED_DOCUMENT_MIME_TYPES;
export const ORDER_DOCUMENT_MAX_UPLOAD_BYTES = DOCUMENT_MAX_UPLOAD_BYTES;
export const ORDER_DOCUMENT_FILE_NAME_MAX_LENGTH =
  DOCUMENT_FILE_NAME_MAX_LENGTH;

/**
 * Where one document is fetched from. Two shapes, because there are two ways
 * to be entitled to an order: a session that may read it, and the token a
 * mailed link carries (FR-NOTIF-06). Which version a generated summary is
 * drawn from follows from the way in, so neither carries one.
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

/**
 * The filename a generated summary is downloaded under, with the order's
 * reference in it: a customer keeps several, and `document.pdf` in a downloads
 * folder is a file nobody can identify a month later.
 */
export function generatedSummaryFileName(reference: string): string {
  return `${reference}.pdf`;
}
