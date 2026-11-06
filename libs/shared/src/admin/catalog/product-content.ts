/**
 * What the admin grid can ask and tell about a product (FR-ADM-20): its own
 * content, then what it carries beyond a name and a price, as the editor
 * orders them. Which of them a row names as missing or draws as glyphs is the
 * grid's choice, not the wire's.
 */
export const PRODUCT_FACTS = [
  'price',
  'picture',
  'description',
  'attributes',
  'packaging',
  'boxFacts',
  'featured',
  'variants',
  'note',
  'set',
  'pairings',
  'documents',
] as const;
export type ProductFact = (typeof PRODUCT_FACTS)[number];

/** A fact asked both ways can match nothing; the query refuses it. */
export function askedBothWays(
  has: readonly string[],
  missing: readonly string[],
): boolean {
  return has.some((fact) => missing.includes(fact));
}
