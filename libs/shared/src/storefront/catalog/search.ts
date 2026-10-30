/**
 * How many categories the search bar suggests beside the products
 * (FR-SEARCH-07). A handful of shortcuts, not a second list to scan.
 */
export const SEARCH_CATEGORY_LIMIT = 3;

/**
 * How many products the search bar's suggestion list offers (FR-SEARCH-05).
 * Enforced server-side and exported so the UI can size the list without
 * guessing. More than the panel shows at once — it scrolls — because a row
 * can be added to the cart from where it is (FR-SEARCH-06), and filling a cart
 * from one query is worth a few rows more than a glance's worth.
 */
export const SEARCH_SUGGESTION_LIMIT = 10;
