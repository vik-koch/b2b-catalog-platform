import { z } from 'zod';

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

export type AcceptedImageMime = (typeof ACCEPTED_IMAGE_MIME_TYPES)[number];

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

/** What the upload endpoint returns: the stable same-origin URL to reference.
 * Alt text is set on the `<img>` node by the editor and lives in the page body,
 * not with the asset. */
export const uploadMediaResponseSchema = z.object({
  url: z.string(),
});
export type UploadMediaResponse = z.infer<typeof uploadMediaResponseSchema>;
