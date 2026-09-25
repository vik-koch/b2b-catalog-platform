import {
  ancestorsOf,
  buildCategoryTree,
  categoryBySlug,
  CategoryRow,
  descendantIds,
  directChildren,
  stockedCategoryIds,
  subtreeCounts,
} from './catalog-tree';

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
      { slug: 'coffee-beans', name: 'COFFEE-BEANS', shortName: null },
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

  it('carries the short name through crumbs, children and the tree', () => {
    expect(
      ancestorsOf(
        'esp',
        rows.map((r) => (r.id === 'cb' ? { ...r, shortName: 'Beans' } : r)),
      ),
    ).toEqual([
      { slug: 'coffee-beans', name: 'COFFEE-BEANS', shortName: 'Beans' },
    ]);
    expect(directChildren('cb', rows).map((c) => c.shortName)).toEqual([
      'Esp',
      null,
    ]);
    expect(buildCategoryTree(rows)[0].children[0].shortName).toBe('Esp');
  });

  it('keeps a stocked category and every ancestor of one', () => {
    // Products sit on the leaf; the parent is kept because of them, and the
    // sibling leaf and the flat category are not.
    expect(stockedCategoryIds(rows, ['esp'])).toEqual(new Set(['esp', 'cb']));
  });

  it('drops a category nothing visible is filed under', () => {
    const stocked = stockedCategoryIds(rows, ['tea']);
    const tree = buildCategoryTree(rows.filter((r) => stocked.has(r.id)));

    expect(tree.map((n) => n.slug)).toEqual(['tea']);
    expect(
      directChildren(
        'cb',
        rows.filter((r) => stocked.has(r.id)),
      ),
    ).toEqual([]);
  });

  it('keeps nothing when nothing is visible', () => {
    expect(stockedCategoryIds(rows, [])).toEqual(new Set());
  });

  it('survives a parent loop rather than hanging on it', () => {
    const looped: CategoryRow[] = [
      { ...cat('a', 'a', 'b', 0) },
      { ...cat('b', 'b', 'a', 1) },
    ];
    expect(stockedCategoryIds(looped, ['a'])).toEqual(new Set(['a', 'b']));
  });

  it('counts a category with everything beneath it', () => {
    const counts = subtreeCounts(
      rows,
      new Map([
        ['cb', 1],
        ['esp', 3],
        ['fil', 2],
      ]),
    );
    expect(counts.get('cb')).toBe(6);
    expect(counts.get('esp')).toBe(3);
    expect(counts.get('fil')).toBe(2);
    expect(counts.has('tea')).toBe(false);
  });

  it('counts through a parent loop once rather than hanging on it', () => {
    const looped: CategoryRow[] = [
      cat('a', 'a', 'b', 0),
      cat('b', 'b', 'a', 1),
    ];
    const counts = subtreeCounts(looped, new Map([['a', 2]]));
    expect(counts.get('a')).toBe(2);
    expect(counts.get('b')).toBe(2);
  });

  it('finds a category by slug', () => {
    expect(categoryBySlug(rows, 'filter')?.id).toBe('fil');
    expect(categoryBySlug(rows, 'nope')).toBeUndefined();
  });
});
