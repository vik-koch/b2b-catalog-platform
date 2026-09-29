import { encodeAttributeParams } from '@b2b-catalog-platform/shared';
import { DefinitionRow } from './category-filters';
import { ResolvedSelection } from './product-facets';

/**
 * A subcategory chip under the listing's filters (FR-ATTR-13).
 *
 * A chip carries on only the part of the selection its target's own panel
 * offers — anything else would filter the next listing by something it can
 * neither show nor clear — and is counted under exactly that part. So a chip
 * whose panel offers none of the selected attributes carries nothing and is
 * counted whole.
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
