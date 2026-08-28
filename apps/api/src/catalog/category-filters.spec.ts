import {
  CategoryAttributeRow,
  categoryChain,
  DefinitionRow,
  resolveCategoryDefinitions,
} from './category-filters';
import { CategoryRow } from './catalog-tree';

function category(id: string, parentId: string | null): CategoryRow {
  return {
    id,
    slug: id,
    name: id,
    shortName: null,
    parentId,
    image: null,
    sortOrder: 0,
  };
}

function definition(id: string, sortOrder: number): DefinitionRow {
  return {
    id,
    name: id,
    slug: id,
    type: 'text',
    unit: null,
    sortOrder,
    createdAt: new Date(),
    updatedAt: new Date(),
    updatedBy: null,
  };
}

function overlay(
  categoryId: string,
  attributeId: string,
  sortOrder: number,
  hidden = false,
): CategoryAttributeRow {
  return { categoryId, attributeId, sortOrder, hidden };
}

const rows = [
  category('coffee', null),
  category('arabica', 'coffee'),
  category('beans', 'arabica'),
];
const definitions = [definition('origin', 0), definition('roast', 1)];

describe('categoryChain', () => {
  it('runs from the category to the root', () => {
    expect(categoryChain('beans', rows)).toEqual([
      'beans',
      'arabica',
      'coffee',
    ]);
  });

  it('stops on a cycle rather than looping', () => {
    const cyclic = [category('a', 'b'), category('b', 'a')];
    expect(categoryChain('a', cyclic)).toEqual(['a', 'b']);
  });
});

describe('resolveCategoryDefinitions', () => {
  it('offers the whole registry where nothing is overlaid', () => {
    expect(resolveCategoryDefinitions(['beans'], definitions, [])).toEqual(
      definitions,
    );
  });

  it('takes the nearest ancestor with an overlay', () => {
    const rows = [
      overlay('coffee', 'origin', 0),
      overlay('arabica', 'roast', 0),
    ];
    const resolved = resolveCategoryDefinitions(
      ['beans', 'arabica', 'coffee'],
      definitions,
      rows,
    );
    expect(resolved.map((row) => row.id)).toEqual(['roast']);
  });

  it('replaces rather than merges: the parent contributes nothing', () => {
    const rows = [
      overlay('coffee', 'origin', 0),
      overlay('coffee', 'roast', 1),
      overlay('beans', 'roast', 0),
    ];
    const resolved = resolveCategoryDefinitions(
      ['beans', 'coffee'],
      definitions,
      rows,
    );
    expect(resolved.map((row) => row.id)).toEqual(['roast']);
  });

  it('leaves out an attribute declared after the overlay was saved', () => {
    const resolved = resolveCategoryDefinitions(
      ['beans'],
      [...definitions, definition('grind', 2)],
      [overlay('beans', 'origin', 0), overlay('beans', 'roast', 1)],
    );
    expect(resolved.map((row) => row.id)).toEqual(['origin', 'roast']);
  });

  it('orders by the overlay, not the registry', () => {
    const resolved = resolveCategoryDefinitions(['beans'], definitions, [
      overlay('beans', 'roast', 0),
      overlay('beans', 'origin', 1),
    ]);
    expect(resolved.map((row) => row.id)).toEqual(['roast', 'origin']);
  });

  it('drops the hidden rows, and an all-hidden overlay offers nothing', () => {
    const resolved = resolveCategoryDefinitions(['beans'], definitions, [
      overlay('beans', 'origin', 0, true),
      overlay('beans', 'roast', 1, true),
    ]);
    expect(resolved).toEqual([]);
  });

  it('drops a row whose definition has since been deleted', () => {
    const resolved = resolveCategoryDefinitions(['beans'], definitions, [
      overlay('beans', 'gone', 0),
      overlay('beans', 'roast', 1),
    ]);
    expect(resolved.map((row) => row.id)).toEqual(['roast']);
  });
});
