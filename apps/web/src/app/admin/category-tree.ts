import { AdminCategory } from '@b2b-catalog-platform/shared';

export interface CategoryTreeNode {
  category: AdminCategory;
  depth: number;
}

const bySortThenName = (a: AdminCategory, b: AdminCategory): number =>
  a.sortOrder - b.sortOrder || a.name.localeCompare(b.name);

/**
 * Flatten a flat category list into depth-first display order — each node
 * preceding its children, siblings ordered by `sortOrder` then name. Shared by
 * the category picker (indented options) and the management tree.
 */
export function flattenCategoryTree(
  categories: readonly AdminCategory[],
): CategoryTreeNode[] {
  const byParent = new Map<string | null, AdminCategory[]>();
  for (const c of categories) {
    const siblings = byParent.get(c.parentId) ?? [];
    siblings.push(c);
    byParent.set(c.parentId, siblings);
  }
  for (const siblings of byParent.values()) siblings.sort(bySortThenName);

  const out: CategoryTreeNode[] = [];
  const walk = (parentId: string | null, depth: number): void => {
    for (const c of byParent.get(parentId) ?? []) {
      out.push({ category: c, depth });
      walk(c.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

export interface CategoryTreeBranch {
  category: AdminCategory;
  children: CategoryTreeBranch[];
}

/**
 * Build the category forest as nested branches — each parent's children ordered
 * by `sortOrder` then name. The management tree renders one CDK drop list per
 * sibling group (drops stay within a group, matching the sibling-only reorder
 * semantics of the `reorderCategories` endpoint).
 */
export function buildCategoryTree(
  categories: readonly AdminCategory[],
): CategoryTreeBranch[] {
  const byParent = new Map<string | null, AdminCategory[]>();
  for (const c of categories) {
    const siblings = byParent.get(c.parentId) ?? [];
    siblings.push(c);
    byParent.set(c.parentId, siblings);
  }
  for (const siblings of byParent.values()) siblings.sort(bySortThenName);

  const build = (parentId: string | null): CategoryTreeBranch[] =>
    (byParent.get(parentId) ?? []).map((category) => ({
      category,
      children: build(category.id),
    }));
  return build(null);
}

/** The ids of every descendant of `id` (excluding `id` itself). */
export function categoryDescendantIds(
  categories: readonly AdminCategory[],
  id: string,
): Set<string> {
  const out = new Set<string>();
  const walk = (parentId: string): void => {
    for (const c of categories) {
      if (c.parentId === parentId && !out.has(c.id)) {
        out.add(c.id);
        walk(c.id);
      }
    }
  };
  walk(id);
  return out;
}
