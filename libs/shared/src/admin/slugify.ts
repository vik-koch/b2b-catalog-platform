import baseSlugify from 'slugify';

/**
 * Turn arbitrary text — including non-Latin scripts — into a URL-safe slug by
 * transliterating to Latin, lowercasing, and joining words with hyphens.
 * `strict` drops anything left that is not `[a-z0-9-]`, so the result always
 * matches `SLUG_PATTERN` (see slug.ts) or is empty.
 *
 * Isomorphic on purpose: the product/category editor calls this to preview the
 * slug live as the admin types the name, and the server calls the same function
 * as the authoritative generator — one transliteration table, no drift.
 *
 * Returns `''` when the input has no transliterable characters. Callers must not
 * store an empty slug — the server falls back to a default stem and a uniqueness
 * suffix. A deployment needing a specific romanization can extend the charmap in
 * its private config; nothing here is language-specific.
 *
 * This lives apart from `slug.ts` so the (CommonJS, untree-shakeable) `slugify`
 * package is only pulled in by code that actually generates slugs — never by the
 * contracts, which import only the pure `slugSchema` from slug.ts.
 */
export function slugify(input: string): string {
  return baseSlugify(input, { lower: true, strict: true, trim: true });
}
