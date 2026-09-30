/**
 * What the admin grid can ask about a product's own content (FR-ADM-20): the
 * gaps a product can have, and the things it can carry. Plain data with no
 * imports, so the grid can read them without pulling the contract schemas in.
 */

/** What a product can carry beyond its name and price, in the one order the
 * grid, its filter and the editor's boxes all follow. */
export const PRODUCT_FEATURES = [
  'featured',
  'variants',
  'note',
  'set',
  'pairings',
  'documents',
] as const;
export type ProductFeature = (typeof PRODUCT_FEATURES)[number];
