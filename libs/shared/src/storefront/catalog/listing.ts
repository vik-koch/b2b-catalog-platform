import {
  PRODUCT_SORTS,
  type SearchSort,
} from '../../core/catalog/product-sort';

/**
 * The product sorts plus `category`, a browsed listing's default: grouped in
 * the tree's order, by name within each group. On a leaf it is name order.
 */
export const CATALOG_SORTS = ['category', ...PRODUCT_SORTS] as const;
export type CatalogSort = (typeof CATALOG_SORTS)[number];

/** Any listing's sort: what the shared sort control speaks. */
export type ListingSort = SearchSort | CatalogSort;

/** Products per listing page (FR-CAT-03). */
export const CATALOG_PAGE_SIZE = 24;
