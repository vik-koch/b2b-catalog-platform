import { attributeDefinitions, categoryAttributes } from '../db/schema';
import { CategoryRow } from './catalog-tree';

/**
 * Which filterable attributes a category offers, and in what order
 * (FR-ATTR-11).
 *
 * The registry's own order is the default, and most categories keep it: the
 * facet panel already drops an attribute no product in scope carries, so a
 * category only needs an overlay when an attribute *is* present and still not
 * worth filtering by, or when the panel reads better in another order.
 *
 * An overlay **replaces** the list rather than adjusting it, and it is
 * inherited: a category with no rows of its own takes the nearest ancestor's
 * overlay whole. Two consequences follow, and both are the point — an override
 * on "Coffee" needs no restating under "Coffee / Arabica", and an attribute
 * declared after an overlay was saved is in no row of it, so it is offered
 * only where nothing is overlaid at all.
 */

/** A registry row as the facets need it. */
export type DefinitionRow = typeof attributeDefinitions.$inferSelect;

/** One overlay row, as stored. */
export type CategoryAttributeRow = typeof categoryAttributes.$inferSelect;

/** A category and its ancestors, nearest first — where an overlay is looked for. */
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
 * The definitions a category's filter panel offers.
 *
 * `overlay` may hold rows for any category in `chain`; the nearest one that
 * has any wins outright, and a mix is never taken — that is what "replaces"
 * means. A row naming a definition that has since been deleted is dropped
 * silently, the same way a stale `attr` parameter is.
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
