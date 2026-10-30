export const CATEGORY_ERROR_CODES = [
  'category-not-found',
  /** The category a delete would move products into is gone. */
  'reassign-target-not-found',
  'category-has-subcategories',
  'category-has-products',
  'category-reassign-to-self',
  /** A reparent that would make a category its own ancestor. */
  'category-cycle',
  /** A category collides on the same unique columns a product does. */
  'slug-taken',
  'source-id-taken',
  'slug-or-source-id-taken',
] as const;
export type CategoryErrorCode = (typeof CATEGORY_ERROR_CODES)[number];
