import * as z from 'zod';

/**
 * A URL-safe slug: one or more lowercase alphanumeric words joined by single
 * hyphens — no leading/trailing/double hyphens, no other characters. This is the
 * shape the admin may hand-type and the shape `slugify` produces, so the editor
 * preview and the server's stored value can never disagree about what is valid.
 */
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Longest slug we store (matches the `slug` varchar on products/categories). */
export const SLUG_MAX_LENGTH = 255;

/**
 * Validator for an admin-supplied slug override (create/update bodies). Omit the
 * field to let the server derive one from the name instead — see `slugify`.
 */
export const slugSchema = z
  .string()
  .trim()
  .min(1)
  .max(SLUG_MAX_LENGTH)
  .regex(SLUG_PATTERN);
// NOTE: the `slugify()` transliteration function lives in its own module
// (`slugify.ts`) so this file stays dependency-free. Contracts import
// `slugSchema` from here; keeping the CJS `slugify` package out of that path
// prevents it leaking (untree-shakeable) into every eager bundle.
