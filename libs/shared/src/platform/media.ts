/** Media limits and upload types. Import-free, so an image picker takes a
 * limit without pulling Zod in. */

/**
 * Checked by sniffing the content, never the declared type or the name. No
 * SVG: it can carry script and is served same-origin. Every image is
 * re-encoded to WebP, so this filters input only.
 */
export const ACCEPTED_IMAGE_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
] as const;
export type AcceptedImageMime = (typeof ACCEPTED_IMAGE_MIME_TYPES)[number];

/** The store builds image URLs under it; the sanitizer admits no other `src`. */
export const MEDIA_URL_PREFIX = '/media';

/** A DoS guard: larger is a mistake, not a use case. */
export const MEDIA_MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

/** A page image's widest edge once stored; never enlarged. */
export const MEDIA_MAX_IMAGE_WIDTH = 1600;

/** A catalog image is stored twice: `full` for the product page, `thumb` for
 * listings and search, each no wider than the storefront draws it. */
export const MEDIA_CATALOG_FULL_WIDTH = 1000;

export const MEDIA_CATALOG_THUMB_WIDTH = 300;

/** Sniffed like images; a scanned certificate often arrives as a photo. */
export const ACCEPTED_DOCUMENT_MIME_TYPES = [
  'application/pdf',
  ...ACCEPTED_IMAGE_MIME_TYPES,
] as const;
export type AcceptedDocumentMime =
  (typeof ACCEPTED_DOCUMENT_MIME_TYPES)[number];

/** Documents are stored as uploaded, so their own prefix keeps them apart
 * from re-encoded images. */
export const DOCUMENT_URL_PREFIX = '/documents';

/** Above an image's cap: nothing downscales a document, so this is the only
 * brake on the volume. */
export const DOCUMENT_MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

/** The uploaded file's own name, kept for recognition only. */
export const DOCUMENT_FILE_NAME_MAX_LENGTH = 255;
