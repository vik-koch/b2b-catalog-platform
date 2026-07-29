import baseSlugify from 'slugify';
import { z } from 'zod';

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

/**
 * Turn arbitrary text — including non-Latin scripts — into a URL-safe slug by
 * transliterating to Latin, lowercasing, and joining words with hyphens.
 * `strict` drops anything left that is not `[a-z0-9-]`, so the result
 * always matches `SLUG_PATTERN` (or is empty).
 *
 * Isomorphic on purpose: the product/category editor calls this to preview the
 * slug live as the admin types the name, and the server calls the same function
 * as the authoritative generator — one transliteration table, no drift.
 *
 * Returns `''` when the input has no transliterable characters. Callers must not
 * store an empty slug — the server falls back to a default stem and a uniqueness
 * suffix. A deployment needing a specific romanization can extend the charmap in
 * its private config; nothing here is language-specific.
 */
export function slugify(input: string): string {
  return baseSlugify(input, { lower: true, strict: true, trim: true });
}
