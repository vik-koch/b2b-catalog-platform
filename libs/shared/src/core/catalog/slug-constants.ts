/**
 * A URL-safe slug: one or more lowercase alphanumeric words joined by single
 * hyphens — no leading/trailing/double hyphens, no other characters. This is the
 * shape the admin may hand-type and the shape `slugify` produces, so the editor
 * preview and the server's stored value can never disagree about what is valid.
 */
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Longest slug we store (matches the `slug` varchar on products/categories). */
export const SLUG_MAX_LENGTH = 255;
