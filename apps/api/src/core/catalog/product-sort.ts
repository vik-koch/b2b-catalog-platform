/**
 * The sort keys every product ordering shares (FR-SEARCH-04), so "by price"
 * means the same on the storefront and in the admin grid. Every order closes
 * with name, then id: without a total order, two equal rows could swap between
 * pages and be shown twice or not at all.
 */

import { asc, desc, sql, SQL } from 'drizzle-orm';
import { PgColumn } from 'drizzle-orm/pg-core';
import { SearchSort } from '@b2b-catalog-platform/shared/core/catalog';
import { products } from '../../db/schema';
import { resolvedPriceMinor } from './product-price';

export type OrderBy = (SQL | PgColumn)[];

/** A resolved price, nullable because a product may not be priced yet. */
export type PriceExpression = SQL<number | null> | PgColumn;

/** The chosen sort alone. A storefront listing leads it with availability;
 * the admin grid filters by it instead (FR-ADM-05). */
export function productSortKeys(
  sort: SearchSort,
  score?: SQL<number>,
  price: PriceExpression = resolvedPriceMinor(null),
): OrderBy {
  const tiebreak: OrderBy = [asc(products.name), asc(products.id)];

  switch (sort) {
    case 'relevance':
      // Name order without a query to score against.
      return score ? [desc(score), ...tiebreak] : tiebreak;
    case 'name':
      return tiebreak;
    case 'name_desc':
      return [desc(products.name), asc(products.id)];
    case 'price':
      return [sql`${price} asc nulls last`, ...tiebreak];
    case 'price_desc':
      // Nulls last both ways: an unpriced product is not the dearest one.
      // Only the admin grid sees one.
      return [sql`${price} desc nulls last`, ...tiebreak];
  }
}
