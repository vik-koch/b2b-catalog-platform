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
 * Ordering for the storefront's listings (FR-SEARCH-04): one definition for
 * the category grid and the search results, over the keys the admin grid
 * shares.
 */

/**
 * What a listing leads with (FR-STOCK-05): everything that can be had, then
 * what cannot. Binary rather than three-way — "few left" is still on the shelf,
 * and a listing that floated the nearly-gone products to the top would be
 * advertising what it is about to run out of. A product whose stock is
 * untracked sorts with the ones that are there, which is what it is.
 *
 * The chosen sort is applied *within* it, so availability is never a sort
 * option of its own. Columns are qualified by hand — a bare name in a template
 * binds to whatever table the surrounding query happens to make available.
 */
const availabilityLast = sql<number>`case
  when ${products.availability} = 'out' then 1
  else 0
end`;

/**
 * `score` is the relevance expression, present only on the search path. It is
 * required for the `relevance` sort and ignored by the others; a caller without
 * one (the category listing) cannot ask for it, because its contract does not
 * offer the key.
 *
 * `price` is the caller's resolved price expression (FR-AUTH-05). It must be
 * the same one the caller selects, or the page is ordered by prices that
 * customer never sees. Omitted, it is the guest's default list.
 */

export function productOrderBy(
  sort: SearchSort,
  score?: SQL<number>,
  price: PriceExpression = resolvedPriceMinor(null),
): OrderBy {
  return [asc(availabilityLast), ...productSortKeys(sort, score, price)];
}

/**
 * The whole-catalogue listing's ordering: the storefront's, plus `category` —
 * the products grouped in `categoryOrder` (every category id, in tree order;
 * see categoryTreeOrder), the availability lead and the name order applied
 * within each group rather than across the whole catalogue.
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
