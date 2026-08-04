import {
  AdminCategory,
  CategoryCrumb,
  CategoryOrderEntry,
} from '@b2b-catalog-platform/shared';

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

/**
 * The ancestors of a category, root-first, excluding it — the same crumb chain
 * the storefront gets from the API, rebuilt locally for the product editor's
 * live preview.
 */
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
  /** Indent level of the insertion line — one deeper than the new parent. */
  depth: number;
}

/**
 * Resolve a drop into a concrete placement.
 *
 * `rows` is the flattened tree with the dragged subtree already removed, `gap`
 * is the slot the line sits in (0 = above the first row, `rows.length` = below
 * the last), and `desiredDepth` is what the pointer's horizontal position asks
 * for. A gap admits a range of depths: no deeper than one level inside the row
 * above it, and no shallower than the row below it — dropping between two
 * siblings cannot leave their parent. The pointer picks within that range,
 * which is what lets a leaf be turned into a parent by aiming right.
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

/**
 * Whether landing on `target` would leave the category exactly where it is.
 *
 * The slot a category currently occupies is reachable from two gaps — the one
 * above its row and the one below its whole subtree — and neither is worth
 * drawing a line for. Suppressing the no-op also stops the same-level line
 * appearing twice for one position.
 */
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

/**
 * The categories whose placement changes when `draggedId` lands on `target`,
 * re-indexed from zero — the old sibling group and the new one, which are often
 * the same group. `reorderCategories` applies whatever set it is given.
 */
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

/**
 * The stored placement of the given categories, for undo. Snapshotting the
 * actual persisted values (rather than re-deriving them) restores a group whose
 * `sortOrder`s were never normalised — e.g. siblings all at 0, ordered by name.
 */
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
