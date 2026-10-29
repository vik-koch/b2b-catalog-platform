/**
 * Why a catalog write was refused. The slug and source-id conflicts are the
 * ones an editor acts on directly — the field it names is on screen — and the
 * category guards are what the delete dialog explains before offering a
 * reassign target.
 */
export const CATALOG_ERROR_CODES = [
  'product-not-found',
  'category-not-found',
  /** The category a delete would move products into is gone. */
  'reassign-target-not-found',
  'category-has-subcategories',
  'category-has-products',
  'category-reassign-to-self',
  /** A reparent (single or in a reorder) that would make a category its own ancestor. */
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
  /**
   * A unique violation that got past the pre-checks — two admins saving the
   * same slug at once. Which of the two columns collided is not worth a round
   * trip to find out, so it is one code.
   */
  'slug-or-source-id-taken',
  /** Publishing a product no price list prices (FR-ADM-06). The storefront
   * shows every visitor the default list's figure, and there is none. */
  'product-has-no-price',
  /** Deleting a product that is on the storefront (FR-ADM-01): removal goes
   * in steps, and taking it off sale is the first. */
  'product-published',
  /** Publishing a deleted product: it is restored first, then published. */
  'product-deleted',
  /** Deleting permanently a product that is not deleted (FR-ADM-21): it goes
   * the same steps as any removal. */
  'product-not-deleted',
  /** Deleting permanently a product somebody has ordered: an order line must
   * never lose its product, so it stays deleted instead. */
  'product-ordered',
] as const;
export type CatalogErrorCode = (typeof CATALOG_ERROR_CODES)[number];

/**
 * The status each refusal travels with. A missing row is a 404; everything
 * else is a conflict — the row is there, and what was asked of it is what
 * cannot be done.
 */
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
