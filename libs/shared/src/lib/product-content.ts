/**
 * What the admin grid can ask about a product's own content (FR-ADM-20): the
 * gaps a product can have, and the things it can carry. Plain data with no
 * imports, so the grid can read them without pulling the contract schemas in.
 */

/**
 * The gaps. The first three make a product incomplete: every product page
 * needs a picture, a description and an attribute. Packaging and box facts
 * are gaps only for goods sold by the pack or box, and a product sold by the
 * piece rightly has neither, so they can be asked about but never count.
 */
export const PRODUCT_GAPS = [
  'picture',
  'description',
  'attributes',
  'packaging',
  'boxFacts',
] as const;
export type ProductGap = (typeof PRODUCT_GAPS)[number];

/** The gaps that make a product incomplete, and the ones a row names. */
export const INCOMPLETE_GAPS = [
  'picture',
  'description',
  'attributes',
] as const satisfies readonly ProductGap[];
export type IncompleteGap = (typeof INCOMPLETE_GAPS)[number];

/** A gap filter's values: one gap, or `incomplete` for any of the three. */
export const PRODUCT_GAP_FILTERS = [...PRODUCT_GAPS, 'incomplete'] as const;
export type ProductGapFilter = (typeof PRODUCT_GAP_FILTERS)[number];

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
