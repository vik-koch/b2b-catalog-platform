import { AdminCategory } from '@b2b-catalog-platform/shared';
import {
  buildCategoryTree,
  categoryDescendantIds,
  flattenCategoryTree,
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

describe('buildCategoryTree', () => {
  it('nests children under parents, siblings by sortOrder then name', () => {
    const tree = buildCategoryTree([
      cat('a', null, 1, 'Apple'),
      cat('a2', 'a', 1),
      cat('a1', 'a', 0),
      cat('m', null, 0, 'Middle'),
    ]);
    expect(
      tree.map((b) => ({
        id: b.category.id,
        children: b.children.map((c) => c.category.id),
      })),
    ).toEqual([
      { id: 'm', children: [] }, // lower sortOrder first
      { id: 'a', children: ['a1', 'a2'] }, // children sorted too
    ]);
  });

  it('handles an empty list', () => {
    expect(buildCategoryTree([])).toEqual([]);
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
