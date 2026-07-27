import {
  ancestorsOf,
  buildCategoryTree,
  categoryBySlug,
  CategoryRow,
  descendantIds,
  directChildren,
} from './catalog-tree';

const cat = (
  id: string,
  slug: string,
  parentId: string | null,
  sortOrder: number,
): CategoryRow => ({
  id,
  slug,
  name: slug.toUpperCase(),
  parentId,
  imageUrl: null,
  sortOrder,
});

// coffee-beans › { espresso, filter }, and a flat tea category.
const rows: CategoryRow[] = [
  cat('cb', 'coffee-beans', null, 0),
  cat('esp', 'espresso', 'cb', 1),
  cat('fil', 'filter', 'cb', 2),
  cat('tea', 'tea', null, 3),
];

describe('catalog-tree', () => {
  it('builds a forest with children under their parents', () => {
    const tree = buildCategoryTree(rows);

    expect(tree.map((n) => n.slug)).toEqual(['coffee-beans', 'tea']);
    expect(tree[0].children.map((n) => n.slug)).toEqual(['espresso', 'filter']);
    expect(tree[1].children).toEqual([]);
  });

  it('collects a category and all its descendants', () => {
    expect(new Set(descendantIds('cb', rows))).toEqual(
      new Set(['cb', 'esp', 'fil']),
    );
    expect(descendantIds('esp', rows)).toEqual(['esp']);
  });

  it('walks ancestors root-first, excluding the category itself', () => {
    expect(ancestorsOf('esp', rows)).toEqual([
      { slug: 'coffee-beans', name: 'COFFEE-BEANS' },
    ]);
    expect(ancestorsOf('cb', rows)).toEqual([]);
  });

  it('lists only direct children as subcategory links', () => {
    expect(directChildren('cb', rows).map((c) => c.slug)).toEqual([
      'espresso',
      'filter',
    ]);
    expect(directChildren('esp', rows)).toEqual([]);
  });

  it('finds a category by slug', () => {
    expect(categoryBySlug(rows, 'filter')?.id).toBe('fil');
    expect(categoryBySlug(rows, 'nope')).toBeUndefined();
  });
});
