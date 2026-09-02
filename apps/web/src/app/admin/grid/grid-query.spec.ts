import {
  DEFAULT_ADMIN_SORT,
  DEFAULT_ADMIN_STATE,
  gridParam,
  resolveAdminSort,
  resolveAdminState,
} from './grid-query';

/**
 * The grid's parameters come from the URL, which anyone can edit and any old
 * bookmark can carry — so what matters here is that nothing but a valid key
 * ever reaches the API, and that the default view has exactly one URL.
 */
describe('resolveAdminSort', () => {
  it.each(['name', 'name_desc', 'price', 'price_desc', 'updated_desc'])(
    'passes %s through',
    (raw) => {
      expect(resolveAdminSort(raw)).toBe(raw);
    },
  );

  it.each([
    ['empty', ''],
    ['unknown', 'colour'],
    ['a storefront-only key', 'best'],
  ])('falls back to the default for %s input', (_label, raw) => {
    expect(resolveAdminSort(raw)).toBe(DEFAULT_ADMIN_SORT);
  });
});

describe('resolveAdminState', () => {
  it.each(['all', 'live', 'deleted'])('passes %s through', (raw) => {
    expect(resolveAdminState(raw)).toBe(raw);
  });

  it.each([
    ['empty', ''],
    ['unknown', 'archived'],
  ])('falls back to the default for %s input', (_label, raw) => {
    expect(resolveAdminState(raw)).toBe(DEFAULT_ADMIN_STATE);
  });
});

describe('gridParam', () => {
  it('drops the default, so the plain URL is the default view', () => {
    expect(gridParam(DEFAULT_ADMIN_STATE, DEFAULT_ADMIN_STATE)).toBeNull();
    expect(gridParam(DEFAULT_ADMIN_SORT, DEFAULT_ADMIN_SORT)).toBeNull();
  });

  it('keeps anything else', () => {
    expect(gridParam('price', DEFAULT_ADMIN_SORT)).toBe('price');
  });
});
