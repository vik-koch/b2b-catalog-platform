import {
  CategoryRow,
  stockedCategoryIds,
} from '../../core/catalog/catalog-tree';
import { buildCategoryTree } from './category-tree';

const cat = (
  id: string,
  slug: string,
  parentId: string | null,
  sortOrder: number,
  shortName: string | null = null,
): CategoryRow => ({
  id,
  slug,
  name: slug.toUpperCase(),
  shortName,
  parentId,
  mark: null,
  sortOrder,
});

// coffee-beans › { espresso, filter }, and a flat tea category.
const rows: CategoryRow[] = [
  cat('cb', 'coffee-beans', null, 0),
  cat('esp', 'espresso', 'cb', 1, 'Esp'),
  cat('fil', 'filter', 'cb', 2),
  cat('tea', 'tea', null, 3),
];

describe('buildCategoryTree', () => {
  it('builds a forest with children under their parents', () => {
    const tree = buildCategoryTree(rows);

    expect(tree.map((n) => n.slug)).toEqual(['coffee-beans', 'tea']);
    expect(tree[0].children.map((n) => n.slug)).toEqual(['espresso', 'filter']);
    expect(tree[1].children).toEqual([]);
  });

  it('carries the short name into the tree', () => {
    expect(buildCategoryTree(rows)[0].children[0].shortName).toBe('Esp');
  });

  it('drops a category nothing visible is filed under', () => {
    const stocked = stockedCategoryIds(rows, ['tea']);
    const tree = buildCategoryTree(rows.filter((r) => stocked.has(r.id)));

    expect(tree.map((n) => n.slug)).toEqual(['tea']);
  });
});
