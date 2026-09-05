/**
 * Product-document limits and the shapes an upload may take. Plain data with
 * no imports, so a form that needs one limit does not pull the document
 * schemas — and Zod — along with it (see `media-constants.ts`).
 */

import { ACCEPTED_IMAGE_MIME_TYPES } from './media-constants';

/**
 * File types the document upload accepts, enforced by *content sniffing* — the
 * client's declared type and filename are never trusted. PDF is what a
 * certificate actually arrives as; the image types are the ones the media
 * upload already sniffs, because a scan is often handed over as a photo. SVG
 * stays absent for the same reason as there: it is script-capable and served
 * same-origin.
 */
export const ACCEPTED_DOCUMENT_MIME_TYPES = [
  'application/pdf',
  ...ACCEPTED_IMAGE_MIME_TYPES,
] as const;

/** Public path prefix stored documents are served under, beside `/media`. The
 * bytes are stored unmodified, so the two are separated by their URL as well
 * as by their pipeline. */
export const DOCUMENT_URL_PREFIX = '/documents';

/**
 * Upper bound on an uploaded document. Larger than an image's cap because
 * nothing downscales a document: a scanned multi-page certificate is the size
 * it is, and the cap is the only brake on what the volume grows to.
 */
export const DOCUMENT_MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

/** The title staff file a document under — what every list and link shows. */
export const DOCUMENT_TITLE_MAX_LENGTH = 200;

/** The uploaded file's own name, kept for recognition only. */
export const DOCUMENT_FILE_NAME_MAX_LENGTH = 255;

/**
 * How many products one save may link a document to. Not a rule about
 * documents — FR-DOC-02 puts no number on it, and a certificate that covers a
 * whole range legitimately names hundreds of products — but a bound on the
 * body, so a malformed request cannot ask for an unbounded write.
 */
export const DOCUMENT_PRODUCTS_MAX = 2000;

/**
 * How many documents one product may be given in a single save. A product
 * carries a handful — a certificate, a declaration, a data sheet — and this is
 * a bound on the body rather than a rule about documents.
 */
export const PRODUCT_DOCUMENTS_MAX = 100;

/** Today as an ISO day, the format every document date is kept in. */
export function isoToday(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}
