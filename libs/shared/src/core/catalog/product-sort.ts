/**
 * How a product listing is ordered (FR-SEARCH-04): name and price, each in both
 * directions, the only two fields a tile shows that a visitor can order by.
 * Every sort is total: the server appends name and id as tiebreakers, so a row
 * cannot swap pages between requests.
 */
export const PRODUCT_SORTS = [
  'name',
  'name_desc',
  'price',
  'price_desc',
] as const;

/**
 * The same, plus relevance. Only a search has a query to be relevant to, so the
 * category listing never has to refuse it.
 */
export const SEARCH_SORTS = ['relevance', ...PRODUCT_SORTS] as const;

export type ProductSort = (typeof PRODUCT_SORTS)[number];
export type SearchSort = (typeof SEARCH_SORTS)[number];
