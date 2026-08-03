import { asc, desc, SQL } from 'drizzle-orm';
import { PgColumn } from 'drizzle-orm/pg-core';
import { AdminProductSort, SearchSort } from '@b2b-catalog-platform/shared';
import { products } from '../db/schema';

/**
 * Ordering for the product listings (FR-SEARCH-04) — one definition shared by
 * the category grid and the search results, so "sorted by price" means the same
 * thing on both.
 *
 * Every result closes with name then id. Without a total order two rows of
 * equal price (or equal relevance) could swap between page requests and be
 * shown twice, or not at all.
 */

type OrderBy = (SQL | PgColumn)[];

/**
 * Price sorts on the stored column. Tier-based price lists (FR-AUTH-05) will
 * make the price a resolved value rather than a column, and this is the place
 * that has to follow — the sort keys in the contract stay as they are.
 */
const priceColumn = products.priceMinor;

/**
 * `score` is the relevance expression, present only on the search path. It is
 * required for the `relevance` sort and ignored by the others; a caller without
 * one (the category listing) cannot ask for it, because its contract does not
 * offer the key.
 */

export function productOrderBy(sort: SearchSort, score?: SQL<number>): OrderBy {
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
      return [asc(priceColumn), ...tiebreak];
    case 'price_desc':
      return [desc(priceColumn), ...tiebreak];
  }
}

/**
 * The admin grid's ordering (FR-ADM-05): the storefront's keys plus recency,
 * which only the admin has a use for. Everything else — including relevance
 * degrading to name order when there is nothing to score — is the shared
 * behaviour, so the two grids never disagree about what "by price" means.
 */
export function adminProductOrderBy(
  sort: AdminProductSort,
  score?: SQL<number>,
): OrderBy {
  const tiebreak: OrderBy = [asc(products.name), asc(products.id)];
  switch (sort) {
    case 'updated':
      return [asc(products.updatedAt), ...tiebreak];
    case 'updated_desc':
      return [desc(products.updatedAt), ...tiebreak];
    default:
      return productOrderBy(sort, score);
  }
}
