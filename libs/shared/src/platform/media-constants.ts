/**
 * Media limits and the shapes an upload may take. Plain data with no
 * imports, so an image picker does not pull the media schemas — and Zod —
 * along with the one limit it needs (see `auth-constants.ts` for why).
 */

/**
 * Image formats accepted by the upload endpoint. This is the allowlist the
 * server enforces by *content sniffing* — the client's declared type and
 * filename extension are never trusted. SVG is deliberately absent: it is
 * script-capable and would be a stored-XSS vector served same-origin. Whatever
 * is accepted is re-encoded to WebP on the way in, so this is an input filter
 * only, not the stored format.
 */
export const ACCEPTED_IMAGE_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
] as const;

/** Public path prefix uploaded images are served under. The single source of
 * truth for the store (which builds these URLs) and the sanitizer (which admits
 * only `src`s under it). */
export const MEDIA_URL_PREFIX = '/media';

/** Upper bound on an uploaded image (a DoS guard). A few MB covers any logo or
 * product photo these pages need; larger is a mistake, not a use case. */
export const MEDIA_MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

/**
 * Page images are stored as a single WebP, downscaled so the widest edge is at
 * most this many pixels (never enlarged). Display size within the body is a CSS
 * concern (the editor's data-size enum), not a stored resolution. The catalog
 * will add its own thumbnail profile when it is built and can be measured.
 */
export const MEDIA_MAX_IMAGE_WIDTH = 1600;

/**
 * Catalog product/category images are stored as two independently
 * content-addressed WebPs: `full` for the product page and `thumb` for the
 * grid/list/search so those views stay light. The widths are smaller than the
 * page-image profile above because the storefront never displays a catalog
 * image larger than these (full ~1000px on the product page, thumb ~300px in
 * the grid/strip). The seed placeholders use the same widths.
 */
export const MEDIA_CATALOG_FULL_WIDTH = 1000;

export const MEDIA_CATALOG_THUMB_WIDTH = 300;

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
export type AcceptedDocumentMime =
  (typeof ACCEPTED_DOCUMENT_MIME_TYPES)[number];

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

/** The uploaded file's own name, kept for recognition only. */
export const DOCUMENT_FILE_NAME_MAX_LENGTH = 255;
