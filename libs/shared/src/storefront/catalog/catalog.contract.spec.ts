import { productListQuerySchema } from './catalog.contract';

/** A query string has no arrays, so one value and several arrive as
 * different things, one checkbox apart. */
describe('productListQuerySchema.attr', () => {
  const attr = (query: Record<string, unknown>) =>
    productListQuerySchema.parse(query).attr;

  it('reads one selected value and several alike', () => {
    expect(attr({ attr: 'colour:Blue' })).toEqual(['colour:Blue']);
    expect(attr({ attr: ['colour:Blue', 'length:30'] })).toEqual([
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
