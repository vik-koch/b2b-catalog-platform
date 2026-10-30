/**
 * A DoS guard on the description, not an editorial rule. It stays well under
 * Express's default body limit, so an oversized body fails contract validation
 * with an explainable 400 rather than an opaque 413.
 */
export const PRODUCT_DESCRIPTION_MAX_LENGTH = 32_000;

/**
 * The rich-text vocabulary a product description may use: the static-page set
 * (`RICH_TEXT_TAGS`) minus headings, links and images. The sanitizer enforces it
 * on write; the stored HTML is trusted on read, as a page body is.
 */
export const PRODUCT_RICH_TEXT_TAGS = [
  'p',
  'br',
  'strong',
  'em',
  'u',
  's',
  'ul',
  'ol',
  'li',
  'blockquote',
  'hr',
] as const;

/** Caps on the custom-attribute table (FR-CAT-05). Bounds, not business rules. */
export const PRODUCT_ATTRIBUTES_MAX = 100;

/** Matches the `products.lineNotePrompt` varchar(200): one short question. */
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

/** Denser than the storefront's page, for scanning. */
export const ADMIN_CATALOG_PAGE_SIZE = 50;

export const PRODUCT_ERROR_CODES = [
  'product-not-found',
  /** The category a product is filed in is gone. */
  'category-not-found',
  /** A tier price naming a price list that no longer exists. */
  'tier-not-found',
  /** A pairing naming a product that no longer exists. */
  'paired-product-not-found',
  /** A save naming a document that no longer exists (FR-DOC-02). */
  'document-not-found',
  /** A product paired with itself, which is not a pairing. */
  'pairing-self',
  'slug-taken',
  'source-id-taken',
  /** A unique violation past the pre-checks, two admins saving at once.
   * Which column collided is not worth a round trip. */
  'slug-or-source-id-taken',
  /** Publishing a product the default list does not price (FR-ADM-06). */
  'product-has-no-price',
  /** Deleting a published product: removal unpublishes first (FR-ADM-01). */
  'product-published',
  /** Publishing a deleted product: it is restored first, then published. */
  'product-deleted',
  /** Purging a product that is not deleted (FR-ADM-21). */
  'product-not-deleted',
  /** Purging an ordered product: an order line never loses its product. */
  'product-ordered',
] as const;
export type ProductErrorCode = (typeof PRODUCT_ERROR_CODES)[number];
