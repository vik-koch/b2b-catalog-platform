/**
 * What the admin grid can ask about a product's own content (FR-ADM-20). The
 * first four gaps make a product incomplete: every product page shows them.
 * Packaging and box facts can be asked about but never count: a product sold
 * by the piece rightly has neither.
 */
export const PRODUCT_GAPS = [
  'price',
  'picture',
  'description',
  'attributes',
  'packaging',
  'boxFacts',
] as const;
export type ProductGap = (typeof PRODUCT_GAPS)[number];

/** The gaps that make a product incomplete, and that a row names. */
export const INCOMPLETE_GAPS = [
  'price',
  'picture',
  'description',
  'attributes',
] as const satisfies readonly ProductGap[];
export type IncompleteGap = (typeof INCOMPLETE_GAPS)[number];

/** A gap filter's values: one gap, or `incomplete` for any of the four. */
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
