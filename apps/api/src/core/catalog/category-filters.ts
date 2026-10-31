/**
 * Which filterable attributes a category offers, in what order (FR-ATTR-11):
 * the registry's, unless the category or an ancestor overlays it. An overlay
 * replaces the list whole and is inherited, so an override on "Coffee" needs no
 * restating under "Coffee / Arabica", and an attribute declared after an
 * overlay was saved is offered only where nothing is overlaid.
 */

import { attributeDefinitions, categoryAttributes } from '../../db/schema';
import { CategoryRow } from './catalog-tree';

/** A registry row as the facets need it. */
export type DefinitionRow = typeof attributeDefinitions.$inferSelect;

/** One overlay row, as stored. */
export type CategoryAttributeRow = typeof categoryAttributes.$inferSelect;

/** A category and its ancestors, nearest first: where an overlay is looked
 * for. */
export function categoryChain(
  categoryId: string,
  rows: CategoryRow[],
): string[] {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const chain: string[] = [];
  let current: string | null = categoryId;
  while (current && !chain.includes(current)) {
    chain.push(current);
    current = byId.get(current)?.parentId ?? null;
  }
  return chain;
}

/**
 * The definitions a category's panel offers. The nearest category in `chain`
 * with overlay rows wins outright; a row naming a deleted definition is
 * dropped, as a stale `attr` parameter is.
 */
export function resolveCategoryDefinitions(
  chain: string[],
  definitions: DefinitionRow[],
  overlay: CategoryAttributeRow[],
): DefinitionRow[] {
  const byCategory = new Map<string, CategoryAttributeRow[]>();
  for (const row of overlay) {
    byCategory.set(row.categoryId, [
      ...(byCategory.get(row.categoryId) ?? []),
      row,
    ]);
  }

  const owner = chain.find((id) => (byCategory.get(id)?.length ?? 0) > 0);
  if (!owner) return definitions;

  const byId = new Map(definitions.map((row) => [row.id, row]));
  return (byCategory.get(owner) ?? [])
    .filter((row) => !row.hidden)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .flatMap((row) => {
      const definition = byId.get(row.attributeId);
      return definition ? [definition] : [];
    });
}
