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
