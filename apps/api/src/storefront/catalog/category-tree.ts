import { CategoryNode } from '@b2b-catalog-platform/shared/storefront/catalog';
import { CategoryRow } from '../../core/catalog/catalog-tree';

/** The category forest from flat rows, pre-sorted by `sortOrder` then name;
 * children keep that order. */
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

/**
 * Every category id depth-first, siblings in the order the rows arrive. A row
 * whose parent is missing counts as a root, as in `buildCategoryTree`; one in
 * a parent loop goes last rather than nowhere.
 */
export function categoryTreeOrder(
  rows: Pick<CategoryRow, 'id' | 'parentId'>[],
): string[] {
  const ids = new Set(rows.map((row) => row.id));
  const children = new Map<string | null, string[]>();
  for (const row of rows) {
    const parent = row.parentId && ids.has(row.parentId) ? row.parentId : null;
    children.set(parent, [...(children.get(parent) ?? []), row.id]);
  }
  const order: string[] = [];
  const seen = new Set<string>();
  const visit = (id: string) => {
    if (seen.has(id)) return;
    seen.add(id);
    order.push(id);
    for (const child of children.get(id) ?? []) visit(child);
  };
  for (const root of children.get(null) ?? []) visit(root);
  for (const row of rows) visit(row.id);
  return order;
}

/** Direct children of a category for the drill-down nav; `null` is the top
 * level. */
export function directChildren(
  categoryId: string | null,
  rows: CategoryRow[],
): CategoryRow[] {
  return rows.filter((row) => row.parentId === categoryId);
}

/**
 * The categories worth linking to: those a visible product sits in directly
 * (`liveIds`), plus every ancestor. One with nothing visible beneath it would
 * be a tile leading to an empty grid, and no admin should have to flag it.
 */
export function stockedCategoryIds(
  rows: Pick<CategoryRow, 'id' | 'parentId'>[],
  liveIds: Iterable<string>,
): Set<string> {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const stocked = new Set<string>();
  for (const id of liveIds) {
    let current: string | null = id;
    // Guarded against a parent loop the write path should have refused, so a
    // bad row costs a wrong tree rather than a hung request.
    while (current && !stocked.has(current)) {
      stocked.add(current);
      current = byId.get(current)?.parentId ?? null;
    }
  }
  return stocked;
}
