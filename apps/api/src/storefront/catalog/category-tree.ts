import { CategoryNode } from '@b2b-catalog-platform/shared/storefront/catalog';
import { CategoryRow } from '../../core/catalog/catalog-tree';

/**
 * Build the category forest from flat rows. Rows are expected pre-sorted by
 * `sortOrder` (then name); children keep that order.
 */
export function buildCategoryTree(rows: CategoryRow[]): CategoryNode[] {
  const nodes = new Map<string, CategoryNode>();
  for (const row of rows) {
    nodes.set(row.id, {
      slug: row.slug,
      name: row.name,
      shortName: row.shortName,
      mark: row.mark,
      children: [],
    });
  }
  const roots: CategoryNode[] = [];
  for (const row of rows) {
    const node = nodes.get(row.id);
    if (!node) continue;
    const parent = row.parentId ? nodes.get(row.parentId) : undefined;
    if (parent) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}
