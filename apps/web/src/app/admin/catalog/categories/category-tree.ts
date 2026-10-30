import { CategoryCrumb } from '@b2b-catalog-platform/shared/core/catalog';
import {
  AdminCategory,
  CategoryOrderEntry,
} from '@b2b-catalog-platform/shared/admin/catalog';

export interface CategoryTreeNode {
  category: AdminCategory;
  depth: number;
}

const bySortThenName = (a: AdminCategory, b: AdminCategory): number =>
  a.sortOrder - b.sortOrder || a.name.localeCompare(b.name);

/** Depth-first display order: each node before its children, siblings by
 * `sortOrder` then name. */
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

/** Root-first, without the category itself: the crumbs the storefront gets
 * from the API, rebuilt for the product editor's preview. */
export function categoryAncestors(
  categories: readonly AdminCategory[],
  categoryId: string,
): CategoryCrumb[] {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const crumbs: CategoryCrumb[] = [];
  let current = byId.get(categoryId)?.parentId ?? null;
  while (current) {
    const c = byId.get(current);
    if (!c) break;
    crumbs.unshift({ slug: c.slug, name: c.name, shortName: c.shortName });
    current = c.parentId;
  }
  return crumbs;
}

/** Where a dragged category would land: which parent, at which sibling index. */
export interface CategoryDropTarget {
  parentId: string | null;
  index: number;
  /** The insertion line's level: one deeper than the new parent. */
  depth: number;
}

/**
 * `rows` is the flattened tree without the dragged subtree, `gap` the slot the
 * line sits in (0 above the first row), `desiredDepth` what the pointer's
 * horizontal position asks for. A gap admits depths from the row below it to
 * one inside the row above; aiming right under a leaf makes it a parent.
 */
export function resolveDropTarget(
  rows: readonly CategoryTreeNode[],
  gap: number,
  desiredDepth: number,
): CategoryDropTarget {
  const above = rows[gap - 1];
  const below = rows[gap];
  const maxDepth = above ? above.depth + 1 : 0;
  const minDepth = below ? below.depth : 0;
  const depth = Math.min(maxDepth, Math.max(minDepth, desiredDepth));

  // The new parent is the nearest row above that sits one level shallower.
  let parentId: string | null = null;
  if (depth > 0) {
    for (let i = gap - 1; i >= 0; i--) {
      if (rows[i].depth === depth - 1) {
        parentId = rows[i].category.id;
        break;
      }
    }
  }

  // Its index is however many of that parent's children are already above.
  let index = 0;
  for (let i = 0; i < gap; i++) {
    if (rows[i].category.parentId === parentId) index++;
  }
  return { parentId, index, depth };
}

/** Its own slot is reachable from the gap above its row and the one below its
 * subtree; neither is a move, so neither draws a line. */
export function isNoOpDropTarget(
  categories: readonly AdminCategory[],
  draggedId: string,
  target: CategoryDropTarget,
): boolean {
  const dragged = categories.find((c) => c.id === draggedId);
  if (!dragged || dragged.parentId !== target.parentId) return false;
  const index = categories
    .filter((c) => c.parentId === dragged.parentId)
    .sort(bySortThenName)
    .findIndex((c) => c.id === draggedId);
  return index === target.index;
}

/** The old sibling group and the new one, often the same, re-indexed from
 * zero. The reorder route applies whatever set it is given. */
export function moveCategoryEntries(
  categories: readonly AdminCategory[],
  draggedId: string,
  target: CategoryDropTarget,
): CategoryOrderEntry[] {
  const dragged = categories.find((c) => c.id === draggedId);
  if (!dragged) return [];

  const siblingsOf = (parentId: string | null): AdminCategory[] =>
    categories
      .filter((c) => c.parentId === parentId && c.id !== draggedId)
      .sort(bySortThenName);

  const destination = siblingsOf(target.parentId);
  destination.splice(target.index, 0, dragged);

  const entries = destination.map((c, i) => ({
    id: c.id,
    parentId: target.parentId,
    sortOrder: i,
  }));
  if (target.parentId === dragged.parentId) return entries;

  return [
    ...siblingsOf(dragged.parentId).map((c, i) => ({
      id: c.id,
      parentId: dragged.parentId,
      sortOrder: i,
    })),
    ...entries,
  ];
}

/** The stored placement, for undo. Stored rather than derived, so a group
 * whose `sortOrder`s were never normalised (all 0, by name) comes back. */
export function currentOrderEntries(
  categories: readonly AdminCategory[],
  ids: Iterable<string>,
): CategoryOrderEntry[] {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const out: CategoryOrderEntry[] = [];
  for (const id of ids) {
    const c = byId.get(id);
    if (c) out.push({ id: c.id, parentId: c.parentId, sortOrder: c.sortOrder });
  }
  return out;
}

/** `id` and every category beneath it. */
export function categorySubtreeIds(
  categories: readonly AdminCategory[],
  id: string,
): Set<string> {
  const out = new Set([id]);
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

/** Where `id` may move or hand its products to: anywhere but its subtree. */
export function categoriesOutside(
  categories: readonly AdminCategory[],
  id: string,
): AdminCategory[] {
  const subtree = categorySubtreeIds(categories, id);
  return categories.filter((c) => !subtree.has(c.id));
}
