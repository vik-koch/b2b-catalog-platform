import {
  PRODUCT_SORTS,
  type SearchSort,
} from '../../core/catalog/product-sort';

/**
 * The same, plus by category — a browsed listing's default: grouped in the
 * category tree's order, by name within each group. Offered only where there
 * are subcategories; on a leaf it is the name order.
 */
export const CATALOG_SORTS = ['category', ...PRODUCT_SORTS] as const;
export type CatalogSort = (typeof CATALOG_SORTS)[number];

/** Any listing's sort: what the shared sort control speaks. */
export type ListingSort = SearchSort | CatalogSort;

/** Default page size for the product grid (FR-CAT-03). */
export const CATALOG_PAGE_SIZE = 24;
