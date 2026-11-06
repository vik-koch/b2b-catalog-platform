import { ProductFact } from '@b2b-catalog-platform/shared/admin/catalog';

/** What every product page shows, so a product lacking any is incomplete
 * (FR-ADM-20) and its row names the lack. Packaging and box facts never
 * count: a product sold by the piece rightly has neither. */
export const INCOMPLETE_FACTS = [
  'price',
  'picture',
  'description',
  'attributes',
] as const satisfies readonly ProductFact[];
export type IncompleteFact = (typeof INCOMPLETE_FACTS)[number];

/** What a product can carry beyond its name and price, drawn as glyphs on its
 * row, in the one order the grid, its filter and the editor's boxes follow. */
export const FEATURE_FACTS = [
  'featured',
  'variants',
  'note',
  'set',
  'pairings',
  'documents',
] as const satisfies readonly ProductFact[];
export type FeatureFact = (typeof FEATURE_FACTS)[number];

export function gapsOf(facts: readonly ProductFact[]): IncompleteFact[] {
  return INCOMPLETE_FACTS.filter((fact) => !facts.includes(fact));
}

export function featuresOf(facts: readonly ProductFact[]): FeatureFact[] {
  return FEATURE_FACTS.filter((fact) => facts.includes(fact));
}
