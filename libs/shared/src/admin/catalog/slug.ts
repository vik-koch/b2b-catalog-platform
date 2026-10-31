/**
 * A URL-safe slug: lowercase alphanumeric words joined by single hyphens. The
 * shape the admin may type and the shape `slugify` produces, so the editor's
 * preview and the stored value cannot disagree about what is valid.
 */
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Longest slug we store (matches the `slug` varchar on products/categories). */
export const SLUG_MAX_LENGTH = 255;
