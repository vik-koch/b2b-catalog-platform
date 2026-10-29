/**
 * Catalog values without the catalog schemas. Plain data and one pure helper,
 * with no imports, so a listing component does not pull Zod into the first
 * load (see `auth-constants.ts` for why).
 */

/**
 * Upper bound on a search term. Longer than any real product query,
 * short enough that no caller can hand the matcher an expensive string.
 * Rejected at the contract rather than truncated, so an over-long query is an
 * explainable 400 instead of silently searching for something else — the search
 * bar caps its own input at the same number.
 */
export const SEARCH_QUERY_MAX_LENGTH = 100;

/** The name to display where the parent is visible: the nickname, or the full
 * name when there is none. */
export function categoryDisplayName(category: {
  name: string;
  shortName?: string | null;
}): string {
  return category.shortName || category.name;
}

/** Matches the `products.name` varchar(512). */
export const PRODUCT_NAME_MAX_LENGTH = 512;

/**
 * A DoS guard on the description, not an editorial rule — comfortably more than
 * any product needs while staying well under Express's default body limit, so an
 * oversized body fails contract validation with an explainable 400 rather than
 * an opaque 413. Smaller than a static page's cap (product copy is short).
 */
export const PRODUCT_DESCRIPTION_MAX_LENGTH = 32_000;

/** Caps on the custom-attribute table (FR-CAT-05). Bounds, not business rules. */
export const PRODUCT_ATTRIBUTES_MAX = 100;

export const PRODUCT_ATTRIBUTE_KEY_MAX_LENGTH = 200;

export const PRODUCT_ATTRIBUTE_VALUE_MAX_LENGTH = 2000;

/** Matches the `products.lineNotePrompt` varchar(200) — one short question. */
export const PRODUCT_LINE_NOTE_PROMPT_MAX_LENGTH = 200;

/** A gallery is a short ordered list, not an archive. */
export const PRODUCT_IMAGES_MAX = 20;

/**
 * A bound, not a business rule: a deployment sells to a handful of customer
 * kinds, and a product can be priced in each at most once.
 */
export const PRODUCT_TIER_PRICES_MAX = 50;

/**
 * A bound, not a business rule: a product is sold together with a handful of
 * others, and the editor lists them all at once.
 */
export const PRODUCT_PAIRINGS_MAX = 20;

/** Matches the `products.sourceId` / `categories.sourceId` varchar(255). */
export const SOURCE_ID_MAX_LENGTH = 255;

/** Matches the `categories.name` varchar(255). */
export const CATEGORY_NAME_MAX_LENGTH = 255;
