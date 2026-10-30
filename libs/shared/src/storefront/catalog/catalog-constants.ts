/**
 * The storefront's listing values without its schemas: plain data, so a
 * listing component does not pull Zod into the first load.
 */

import { PRODUCT_SORTS } from '../../core/catalog/product-sort';

/**
 * The same, plus by category — a browsed listing's default: grouped in the
 * category tree's order, by name within each group. Offered only where there
 * are subcategories; on a leaf it is the name order.
 */
export const CATALOG_SORTS = ['category', ...PRODUCT_SORTS] as const;

/**
 * How many products the main page's row holds (FR-CAT-09): five 15rem columns
 * are exactly the page's width, so a wide screen shows the whole row and a
 * narrower one scrolls the same five.
 */
export const FEATURED_ROW_SIZE = 5;

/**
 * How many categories the search bar suggests beside the products
 * (FR-SEARCH-07). A handful of shortcuts, not a second list to scan.
 */
export const SEARCH_CATEGORY_LIMIT = 3;
