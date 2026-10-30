import baseSlugify from 'slugify';

/**
 * Text in any script as a URL-safe slug: transliterated to Latin, lowercased,
 * words joined by hyphens. `strict` drops anything else, so the result is a valid
 * slug or empty, and the server never stores an empty one: it falls back to a
 * default stem.
 *
 * The editor previews with it and the server generates with it, so the two
 * cannot disagree. Kept out of `slug.ts` because the `slugify` package is
 * CommonJS and cannot be tree-shaken: only code that generates slugs pays for it.
 */
export function slugify(input: string): string {
  return baseSlugify(input, { lower: true, strict: true, trim: true });
}
