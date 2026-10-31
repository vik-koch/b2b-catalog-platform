import { signal } from '@angular/core';
import { CATALOG_SORTS } from '@b2b-catalog-platform/shared/storefront/catalog';
import { listingParams, sortParam } from './listing-params';

const read = (
  page: string,
  sort: string,
  attr: string | readonly string[] | undefined,
) =>
  listingParams(
    { page: signal(page), sort: signal(sort), attr: signal(attr) },
    CATALOG_SORTS,
    'category',
  );

describe('listingParams', () => {
  it('reads a page, falling back to the first', () => {
    expect(read('3', '', undefined).page()).toBe(3);
    expect(read('0', '', undefined).page()).toBe(1);
    expect(read('2.5', '', undefined).page()).toBe(1);
    expect(read('x', '', undefined).page()).toBe(1);
  });

  it("sends an unknown sort as the listing's default, left out of links", () => {
    const params = read('1', 'relevance', undefined);
    expect(params.sort()).toBe('category');
    expect(params.sortParam()).toBeNull();
    expect(read('1', 'price_desc', undefined).sortParam()).toBe('price_desc');
  });

  it('reads one ticked value as a list, and none as no parameter', () => {
    const one = read('1', '', 'roast:dark');
    expect(one.attr()).toEqual(['roast:dark']);
    expect(one.hasSelection()).toBe(true);
    expect(read('1', '', undefined).attrParam()).toBeNull();
  });
});

describe('sortParam', () => {
  it('omits the default so one view has one URL', () => {
    expect(sortParam('name', 'name')).toBeNull();
    expect(sortParam('relevance', 'relevance')).toBeNull();
  });

  it("carries anything else, the default being the listing's own", () => {
    expect(sortParam('price', 'name')).toBe('price');
    expect(sortParam('name', 'relevance')).toBe('name');
  });
});
