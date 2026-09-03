/**
 * Catalog values the storefront needs without the catalog schemas. Plain data
 * and one pure helper, with no imports, so a listing component does not pull
 * Zod into the first load (see `auth-constants.ts` for why).
 */

/**
 * How a product listing is ordered (FR-SEARCH-04). Name and price, each in both
 * directions — the only two fields a tile shows that a visitor can meaningfully
 * order by. Every sort is total: the server appends name and id as tiebreakers,
 * so a row cannot swap pages between requests.
 */
export const PRODUCT_SORTS = [
  'name',
  'name_desc',
  'price',
  'price_desc',
] as const;

/**
 * The same, plus relevance — only meaningful where there is a query to be
 * relevant to, so it exists on the search endpoint alone rather than as a
 * fourth option the category listing has to reject.
 */
export const SEARCH_SORTS = ['relevance', ...PRODUCT_SORTS] as const;

/**
 * Upper bound on a search term. Longer than any real product query,
 * short enough that no caller can hand the matcher an expensive string.
 * Rejected at the contract rather than truncated, so an over-long query is an
 * explainable 400 instead of silently searching for something else — the search
 * bar caps its own input at the same number.
 */
export const SEARCH_QUERY_MAX_LENGTH = 100;

/** The name to display where the parent is visible: the nickname, or the full
 * name when there is none. */
export function categoryDisplayName(category: {
  name: string;
  shortName?: string | null;
}): string {
  return category.shortName || category.name;
}
