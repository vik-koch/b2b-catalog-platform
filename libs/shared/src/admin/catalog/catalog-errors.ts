/** Why a product or category write was refused. */
export const CATALOG_ERROR_CODES = [
  'product-not-found',
  'category-not-found',
  /** The category a delete would move products into is gone. */
  'reassign-target-not-found',
  'category-has-subcategories',
  'category-has-products',
  'category-reassign-to-self',
  /** A reparent that would make a category its own ancestor. */
  'category-cycle',
  'slug-taken',
  'source-id-taken',
  /** A tier price naming a price list that no longer exists. */
  'tier-not-found',
  /** A pairing naming a product that no longer exists. */
  'paired-product-not-found',
  /** A save naming a document that no longer exists (FR-DOC-02). */
  'document-not-found',
  /** A product paired with itself, which is not a pairing. */
  'pairing-self',
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
export type CatalogErrorCode = (typeof CATALOG_ERROR_CODES)[number];

/** A missing row is a 404; everything else is a conflict. */
export const CATALOG_ERRORS = {
  'product-not-found': { status: 404 },
  'category-not-found': { status: 404 },
  'reassign-target-not-found': { status: 404 },
  'tier-not-found': { status: 404 },
  'paired-product-not-found': { status: 404 },
  'document-not-found': { status: 404 },
  'pairing-self': { status: 409 },
  'category-has-subcategories': { status: 409 },
  'category-has-products': { status: 409 },
  'category-reassign-to-self': { status: 409 },
  'category-cycle': { status: 409 },
  'slug-taken': { status: 409 },
  'source-id-taken': { status: 409 },
  'slug-or-source-id-taken': { status: 409 },
  'product-has-no-price': { status: 409 },
  'product-published': { status: 409 },
  'product-deleted': { status: 409 },
  'product-not-deleted': { status: 409 },
  'product-ordered': { status: 409 },
} as const satisfies Record<CatalogErrorCode, { status: number }>;
