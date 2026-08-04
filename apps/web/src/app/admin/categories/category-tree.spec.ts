import { AdminCategory } from '@b2b-catalog-platform/shared';
import {
  categoryDescendantIds,
  currentOrderEntries,
  flattenCategoryTree,
  isNoOpDropTarget,
  moveCategoryEntries,
  resolveDropTarget,
} from './category-tree';

const cat = (
  id: string,
  parentId: string | null,
  sortOrder = 0,
  name = id,
): AdminCategory => ({
  id,
  slug: id,
  name,
  shortName: null,
  parentId,
  sortOrder,
  image: null,
  sourceId: 'manual:x',
  description: null,
  productCount: 0,
  childCount: 0,
});

describe('flattenCategoryTree', () => {
  it('orders depth-first with each node before its children', () => {
    const flat = flattenCategoryTree([
      cat('a', null, 0),
      cat('a1', 'a', 0),
      cat('a2', 'a', 1),
      cat('b', null, 1),
    ]);
    expect(flat.map((n) => `${n.category.id}@${n.depth}`)).toEqual([
      'a@0',
      'a1@1',
      'a2@1',
      'b@0',
    ]);
  });

  it('orders siblings by sortOrder then name', () => {
    const flat = flattenCategoryTree([
      cat('z', null, 0, 'Zebra'),
      cat('a', null, 0, 'Apple'),
      cat('m', null, -1, 'Middle'),
    ]);
    expect(flat.map((n) => n.category.name)).toEqual([
      'Middle', // lowest sortOrder first
      'Apple', // tie on sortOrder → name
      'Zebra',
    ]);
  });

  it('handles an empty list', () => {
    expect(flattenCategoryTree([])).toEqual([]);
  });
});

describe('currentOrderEntries', () => {
  const categories = [cat('a', null, 5), cat('a1', 'a', 0), cat('b', null, 2)];

  it('snapshots the stored placement, not a re-derived one', () => {
    expect(currentOrderEntries(categories, ['a', 'a1'])).toEqual([
      { id: 'a', parentId: null, sortOrder: 5 },
      { id: 'a1', parentId: 'a', sortOrder: 0 },
    ]);
  });

  it('skips ids it does not know', () => {
    expect(currentOrderEntries(categories, ['b', 'gone'])).toEqual([
      { id: 'b', parentId: null, sortOrder: 2 },
    ]);
  });
});

describe('categoryDescendantIds', () => {
  const tree = [
    cat('a', null),
    cat('a1', 'a'),
    cat('a1x', 'a1'),
    cat('b', null),
  ];

  it('collects all descendants, excluding the node itself', () => {
    expect(categoryDescendantIds(tree, 'a')).toEqual(new Set(['a1', 'a1x']));
  });

  it('is empty for a leaf', () => {
    expect(categoryDescendantIds(tree, 'b')).toEqual(new Set());
  });
});

describe('resolveDropTarget', () => {
  /*
   *  a          depth 0
   *    a1       depth 1
   *      a1x    depth 2
   *  b          depth 0
   */
  const rows = flattenCategoryTree([
    cat('a', null, 0),
    cat('a1', 'a', 0),
    cat('a1x', 'a1', 0),
    cat('b', null, 1),
  ]);

  it('drops at the top of the tree', () => {
    expect(resolveDropTarget(rows, 0, 0)).toEqual({
      parentId: null,
      index: 0,
      depth: 0,
    });
  });

  it('clamps to no deeper than one level inside the row above', () => {
    // The gap below 'a1x' (depth 2) allows at most depth 3.
    expect(resolveDropTarget(rows, 3, 99)).toEqual({
      parentId: 'a1x',
      index: 0,
      depth: 3,
    });
  });

  it('clamps to no shallower than the row below', () => {
    // Between 'a' and 'a1': 'a1' is depth 1, so the gap cannot go to root.
    expect(resolveDropTarget(rows, 1, 0)).toEqual({
      parentId: 'a',
      index: 0,
      depth: 1,
    });
  });

  it('lets the pointer choose the level in the gap after a subtree', () => {
    // The gap between 'a1x' and 'b' spans depth 0 ('b' is root) to depth 3.
    expect(resolveDropTarget(rows, 3, 0).parentId).toBeNull();
    expect(resolveDropTarget(rows, 3, 1).parentId).toBe('a');
    expect(resolveDropTarget(rows, 3, 2).parentId).toBe('a1');
    expect(resolveDropTarget(rows, 3, 3).parentId).toBe('a1x');
  });

  it('counts the index among that parent’s existing children', () => {
    // Landing at root after 'b', which is root child number two.
    expect(resolveDropTarget(rows, 4, 0)).toEqual({
      parentId: null,
      index: 2,
      depth: 0,
    });
  });

  it('handles an empty tree', () => {
    expect(resolveDropTarget([], 0, 3)).toEqual({
      parentId: null,
      index: 0,
      depth: 0,
    });
  });
});

describe('moveCategoryEntries', () => {
  const categories = [
    cat('a', null, 0),
    cat('a1', 'a', 0),
    cat('a2', 'a', 1),
    cat('b', null, 1),
  ];

  it('reparents and re-indexes both the old and the new group', () => {
    // 'a1' becomes a child of 'b'.
    expect(
      moveCategoryEntries(categories, 'a1', {
        parentId: 'b',
        index: 0,
        depth: 1,
      }),
    ).toEqual([
      // The group it left, closed up.
      { id: 'a2', parentId: 'a', sortOrder: 0 },
      // The group it joined.
      { id: 'a1', parentId: 'b', sortOrder: 0 },
    ]);
  });

  it('posts only the one group when reordering within it', () => {
    expect(
      moveCategoryEntries(categories, 'a2', {
        parentId: 'a',
        index: 0,
        depth: 1,
      }),
    ).toEqual([
      { id: 'a2', parentId: 'a', sortOrder: 0 },
      { id: 'a1', parentId: 'a', sortOrder: 1 },
    ]);
  });

  it('promotes a child to the root', () => {
    expect(
      moveCategoryEntries(categories, 'a1', {
        parentId: null,
        index: 1,
        depth: 0,
      }),
    ).toEqual([
      { id: 'a2', parentId: 'a', sortOrder: 0 },
      { id: 'a', parentId: null, sortOrder: 0 },
      { id: 'a1', parentId: null, sortOrder: 1 },
      { id: 'b', parentId: null, sortOrder: 2 },
    ]);
  });

  it('is empty for an unknown category', () => {
    expect(
      moveCategoryEntries(categories, 'gone', {
        parentId: null,
        index: 0,
        depth: 0,
      }),
    ).toEqual([]);
  });
});

describe('isNoOpDropTarget', () => {
  const categories = [
    cat('a', null, 0),
    cat('a1', 'a', 0),
    cat('a2', 'a', 1),
    cat('b', null, 1),
  ];

  it('is true for the slot the category already occupies', () => {
    expect(
      isNoOpDropTarget(categories, 'a2', {
        parentId: 'a',
        index: 1,
        depth: 1,
      }),
    ).toBe(true);
  });

  it('is false for a different index under the same parent', () => {
    expect(
      isNoOpDropTarget(categories, 'a2', {
        parentId: 'a',
        index: 0,
        depth: 1,
      }),
    ).toBe(false);
  });

  it('is false for a different parent', () => {
    expect(
      isNoOpDropTarget(categories, 'a2', {
        parentId: null,
        index: 1,
        depth: 0,
      }),
    ).toBe(false);
  });
});
