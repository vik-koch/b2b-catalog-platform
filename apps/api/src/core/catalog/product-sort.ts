import { asc, desc, sql, SQL } from 'drizzle-orm';
import { PgColumn } from 'drizzle-orm/pg-core';
import { SearchSort } from '@b2b-catalog-platform/shared/core/catalog';
import { products } from '../../db/schema';
import { resolvedPriceMinor } from './product-price';

/**
 * The sort keys every product ordering shares (FR-SEARCH-04), so "sorted by
 * price" means the same on the storefront and in the admin grid.
 *
 * Every result closes with name then id. Without a total order two rows of
 * equal price (or equal relevance) could swap between page requests and be
 * shown twice, or not at all.
 */

export type OrderBy = (SQL | PgColumn)[];

/** A resolved price, nullable because a product may not be priced yet. */
export type PriceExpression = SQL<number | null> | PgColumn;

/**
 * The chosen sort alone. A storefront listing leads it with availability; the
 * admin grid does not, because a manager narrowing the catalog by name or by
 * price is answering a question about the catalog, not shopping in it, and a
 * column of empty shelves pinned to the bottom of every page would be in the
 * way of every one of those questions. The grid filters by availability
 * instead (FR-ADM-05).
 */
export function productSortKeys(
  sort: SearchSort,
  score?: SQL<number>,
  price: PriceExpression = resolvedPriceMinor(null),
): OrderBy {
  const tiebreak: OrderBy = [asc(products.name), asc(products.id)];

  switch (sort) {
    case 'relevance':
      // Falls back to the name order when there is no query to score against,
      // which is the same thing an unscored listing would do anyway.
      return score ? [desc(score), ...tiebreak] : tiebreak;
    case 'name':
      return tiebreak;
    case 'name_desc':
      return [desc(products.name), asc(products.id)];
    case 'price':
      return [sql`${price} asc nulls last`, ...tiebreak];
    case 'price_desc':
      // Nulls last in both directions: a product nobody has priced is not the
      // dearest thing in the catalog, it is the one with no answer. Only the
      // admin grid can see one at all.
      return [sql`${price} desc nulls last`, ...tiebreak];
  }
}
