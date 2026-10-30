import {
  DEFAULT_SORT,
  DEFAULT_STATE,
  resolveSort,
  resolveState,
} from './product-grid-query';

/**
 * The grid's parameters come from the URL, which anyone can edit and any old
 * bookmark can carry — so what matters here is that nothing but a valid key
 * ever reaches the API, and that the default view has exactly one URL.
 */
describe('resolveSort', () => {
  it.each(['name', 'name_desc', 'price', 'price_desc', 'updated_desc'])(
    'passes %s through',
    (raw) => {
      expect(resolveSort(raw)).toBe(raw);
    },
  );

  it.each([
    ['empty', ''],
    ['unknown', 'colour'],
    ['a storefront-only key', 'best'],
  ])('falls back to the default for %s input', (_label, raw) => {
    expect(resolveSort(raw)).toBe(DEFAULT_SORT);
  });
});

describe('resolveState', () => {
  it.each(['all', 'live', 'deleted'])('passes %s through', (raw) => {
    expect(resolveState(raw)).toBe(raw);
  });

  it.each([
    ['empty', ''],
    ['unknown', 'archived'],
  ])('falls back to the default for %s input', (_label, raw) => {
    expect(resolveState(raw)).toBe(DEFAULT_STATE);
  });
});
