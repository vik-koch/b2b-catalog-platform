import { encodeAttributeParams } from '@b2b-catalog-platform/shared/core/catalog';
import { DefinitionRow } from '../../core/catalog/category-filters';
import { ResolvedSelection } from './product-facets';

/**
 * The part of the selection a subcategory chip carries on (FR-ATTR-13): only
 * what its target's panel offers, or the next listing would filter by
 * something it can neither show nor clear.
 */
export function carriedSelections(
  selections: ResolvedSelection[],
  offered: DefinitionRow[],
): ResolvedSelection[] {
  const ids = new Set(offered.map((definition) => definition.id));
  return selections.filter(({ definition }) => ids.has(definition.id));
}

/** A selection as the `attr` entries a link writes. */
export function selectionParams(selections: ResolvedSelection[]): string[] {
  return encodeAttributeParams(
    selections.map(({ definition, values }) => ({
      slug: definition.slug,
      values,
    })),
  );
}
