import { DefinitionRow } from './category-filters';
import { ResolvedSelection } from './product-facets';
import { carriedSelections, selectionParams } from './subcategory-links';

function definition(id: string): DefinitionRow {
  return {
    id,
    name: id.toUpperCase(),
    slug: id,
    type: 'text',
    unit: null,
    sortOrder: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    updatedBy: null,
  };
}

const brand = definition('brand');
const grind = definition('grind');
const selections: ResolvedSelection[] = [
  { definition: brand, values: ['Hafen'] },
  { definition: grind, values: ['fine', 'coarse'] },
];

describe('carriedSelections', () => {
  it('keeps only what the target panel offers', () => {
    expect(carriedSelections(selections, [grind])).toEqual([selections[1]]);
  });

  it('carries nothing into a panel that offers none of it', () => {
    expect(carriedSelections(selections, [definition('origin')])).toEqual([]);
  });
});

describe('selectionParams', () => {
  it('writes one attr entry per value, by slug', () => {
    expect(selectionParams(selections)).toEqual([
      'brand:Hafen',
      'grind:fine',
      'grind:coarse',
    ]);
  });
});
