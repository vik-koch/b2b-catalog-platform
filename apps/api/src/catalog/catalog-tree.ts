import { CategoryNode } from '@b2b-catalog-platform/shared';

/** A flat category row as stored, the input to every tree computation below. */
export interface CategoryRow {
  id: string;
  slug: string;
  name: string;
  parentId: string | null;
  imageUrl: string | null;
  sortOrder: number;
}

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
      imageUrl: row.imageUrl,
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

export function categoryBySlug(
  rows: CategoryRow[],
  slug: string,
): CategoryRow | undefined {
  return rows.find((row) => row.slug === slug);
}

/**
 * The category and all its descendants (products live only on leaves, so a
 * parent page shows everything beneath it — Pattern A).
 */
export function descendantIds(rootId: string, rows: CategoryRow[]): string[] {
  const ids = new Set<string>([rootId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const row of rows) {
      if (row.parentId && ids.has(row.parentId) && !ids.has(row.id)) {
        ids.add(row.id);
        grew = true;
      }
    }
  }
  return [...ids];
}

/** Breadcrumb ancestors of a category, root-first, excluding the category. */
export function ancestorsOf(
  categoryId: string,
  rows: CategoryRow[],
): { slug: string; name: string }[] {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const crumbs: { slug: string; name: string }[] = [];
  let current = byId.get(categoryId)?.parentId ?? null;
  while (current) {
    const row = byId.get(current);
    if (!row) break;
    crumbs.unshift({ slug: row.slug, name: row.name });
    current = row.parentId;
  }
  return crumbs;
}

/** Direct children of a category, for the drill-down nav. */
export function directChildren(
  categoryId: string,
  rows: CategoryRow[],
): { slug: string; name: string; imageUrl: string | null }[] {
  return rows
    .filter((row) => row.parentId === categoryId)
    .map((row) => ({ slug: row.slug, name: row.name, imageUrl: row.imageUrl }));
}
