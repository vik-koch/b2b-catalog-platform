import {
  ancestorsOf,
  categoryBySlug,
  CategoryRow,
  descendantIds,
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

  it('carries the short name through crumbs', () => {
    expect(
      ancestorsOf(
        'esp',
        rows.map((r) => (r.id === 'cb' ? { ...r, shortName: 'Beans' } : r)),
      ),
    ).toEqual([
      { slug: 'coffee-beans', name: 'COFFEE-BEANS', shortName: 'Beans' },
    ]);
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
