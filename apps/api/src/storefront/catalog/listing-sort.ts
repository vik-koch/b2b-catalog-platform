/** Ordering for the storefront's listings and search results (FR-SEARCH-04),
 * over the keys the admin grid shares. */

import { asc, sql, SQL } from 'drizzle-orm';
import { CatalogSort } from '@b2b-catalog-platform/shared/storefront/catalog';
import { SearchSort } from '@b2b-catalog-platform/shared/core/catalog';
import { products } from '../../db/schema';
import { resolvedPriceMinor } from '../../core/catalog/product-price';
import {
  OrderBy,
  PriceExpression,
  productSortKeys,
} from '../../core/catalog/product-sort';

/**
 * What a listing leads with (FR-STOCK-05): what can be had, then what cannot.
 * Binary: "few left" is still on the shelf, and untracked stock sorts with it.
 * The chosen sort applies within each half.
 */
const availabilityLast = sql<number>`case
  when ${products.availability} = 'out' then 1
  else 0
end`;

/**
 * `score` is the search's relevance, needed only for `relevance`. `price` must
 * be the expression the caller selects (FR-AUTH-05), or the page is ordered by
 * prices that customer never sees.
 */
export function productOrderBy(
  sort: SearchSort,
  score?: SQL<number>,
  price: PriceExpression = resolvedPriceMinor(null),
): OrderBy {
  return [asc(availabilityLast), ...productSortKeys(sort, score, price)];
}

/**
 * A browsed listing's ordering: the storefront's, plus `category`, which groups
 * the products in `categoryOrder` (`categoryTreeOrder`) with the availability
 * lead and name order applied within each group.
 */
export function catalogOrderBy(
  sort: CatalogSort,
  price: PriceExpression,
  categoryOrder: string[],
): OrderBy {
  if (sort !== 'category') return productOrderBy(sort, undefined, price);
  const position = sql<number>`array_position(${sql.param(categoryOrder)}::uuid[], ${products.categoryId})`;
  return [
    asc(position),
    asc(availabilityLast),
    asc(products.name),
    asc(products.id),
  ];
}
