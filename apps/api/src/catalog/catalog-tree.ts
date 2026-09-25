import {
  CatalogImage,
  CategoryCrumb,
  CategoryNode,
  SubcategoryLink,
} from '@b2b-catalog-platform/shared';

/** A flat category row as stored, the input to every tree computation below. */
export interface CategoryRow {
  id: string;
  slug: string;
  name: string;
  shortName: string | null;
  parentId: string | null;
  /** The chip mark (FR-CAT-07). */
  mark: CatalogImage | null;
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

export function categoryBySlug(
  rows: CategoryRow[],
  slug: string,
): CategoryRow | undefined {
  return rows.find((row) => row.slug === slug);
}

/**
 * The category and all its descendants: a parent page shows everything beneath
 * it (Pattern A).
 */
export function descendantIds(
  rootId: string,
  rows: Pick<CategoryRow, 'id' | 'parentId'>[],
): string[] {
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

/**
 * Each category's products plus everything beneath it, the way the storefront
 * listing scopes a category (FR-ADM-19): every direct count is added to its
 * own category and to each ancestor up the chain. A broken chain stops the
 * walk rather than looping — the reparent guards keep the tree acyclic, and
 * this must not hang if they ever did not.
 */
export function subtreeCounts(
  rows: { id: string; parentId: string | null }[],
  direct: Map<string, number>,
): Map<string, number> {
  const parentOf = new Map(rows.map((r) => [r.id, r.parentId]));
  const totals = new Map<string, number>();
  for (const [categoryId, value] of direct) {
    const seen = new Set<string>();
    let current: string | null | undefined = categoryId;
    while (current && parentOf.has(current) && !seen.has(current)) {
      seen.add(current);
      totals.set(current, (totals.get(current) ?? 0) + value);
      current = parentOf.get(current);
    }
  }
  return totals;
}

/** Breadcrumb ancestors of a category, root-first, excluding the category. */
export function ancestorsOf(
  categoryId: string,
  rows: CategoryRow[],
): CategoryCrumb[] {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const crumbs: CategoryCrumb[] = [];
  let current = byId.get(categoryId)?.parentId ?? null;
  while (current) {
    const row = byId.get(current);
    if (!row) break;
    crumbs.unshift({
      slug: row.slug,
      name: row.name,
      shortName: row.shortName,
    });
    current = row.parentId;
  }
  return crumbs;
}

/** Direct children of a category, for the drill-down nav. */
export function directChildren(
  categoryId: string,
  rows: CategoryRow[],
): SubcategoryLink[] {
  return rows
    .filter((row) => row.parentId === categoryId)
    .map((row) => ({
      slug: row.slug,
      name: row.name,
      shortName: row.shortName,
      mark: row.mark,
    }));
}

/**
 * The categories worth linking to: those a publicly visible product is filed
 * under, plus every ancestor of one.
 *
 * A category is a grouping of products rather than a thing in its own right, so
 * one with nothing visible beneath it is a tile leading to an empty grid. That
 * happens both ways round — a category the sync has just created holds only
 * unpublished products, and a category the sync has emptied holds none at all —
 * and neither wants a flag an admin has to remember to set.
 *
 * `liveIds` are the categories products sit in directly; walking upward is what
 * keeps a parent whose stock all lives in its children.
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
