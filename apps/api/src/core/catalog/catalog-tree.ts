import {
  CatalogImage,
  CategoryCrumb,
} from '@b2b-catalog-platform/shared/core/catalog';

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

export function categoryBySlug(
  rows: CategoryRow[],
  slug: string,
): CategoryRow | undefined {
  return rows.find((row) => row.slug === slug);
}

/** The category and all its descendants: a parent page shows everything
 * beneath it. */
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
 * Each category's count plus everything beneath it, as a listing scopes a
 * category (FR-ADM-19). A parent loop stops the walk rather than hanging it.
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
