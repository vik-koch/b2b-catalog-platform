import { productListQuerySchema } from './catalog.contract';

/**
 * A query string has no array type, and every layer between the panel and the
 * API spells one differently — so the filter parameter has to read all three.
 */
describe('productListQuerySchema.attr', () => {
  const attr = (query: Record<string, unknown>) =>
    productListQuerySchema.parse(query).attr;

  it('reads a single parameter, an indexed array and qs’ object form alike', () => {
    expect(attr({ attr: 'colour:Blue' })).toEqual(['colour:Blue']);
    expect(attr({ attr: ['colour:Blue', 'length:30'] })).toEqual([
      'colour:Blue',
      'length:30',
    ]);
    // What qs returns once there are more than 20 entries.
    expect(attr({ attr: { '0': 'colour:Blue', '1': 'length:30' } })).toEqual([
      'colour:Blue',
      'length:30',
    ]);
  });

  it('defaults to no selection', () => {
    expect(attr({})).toEqual([]);
  });

  it('takes far more values than the panel can produce', () => {
    const many = Array.from({ length: 100 }, (_, i) => `length:${i}`);

    expect(attr({ attr: many })).toHaveLength(100);
  });
});
