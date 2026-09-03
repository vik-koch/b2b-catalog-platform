import { asc, desc, sql, SQL } from 'drizzle-orm';
import { PgColumn } from 'drizzle-orm/pg-core';
import { AdminProductSort, SearchSort } from '@b2b-catalog-platform/shared';
import { products } from '../db/schema';
import { resolvedPiecePrice } from './product-price';

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
 *
 * Always a price per piece: a stored price covers `priceBasisPieces` pieces, so
 * raw prices are not comparable between products.
 */

export function productOrderBy(
  sort: SearchSort,
  score?: SQL<number>,
  price: SQL<number> | PgColumn = resolvedPiecePrice(null),
): OrderBy {
  return [asc(availabilityLast), ...sortKeys(sort, score, price)];
}

/**
 * The chosen sort alone, without the availability lead — what the admin grid
 * orders by. A manager narrowing the catalog by name or by price is answering a
 * question about the catalog, not shopping in it, and a column of empty shelves
 * pinned to the bottom of every page would be in the way of every one of those
 * questions. The grid filters by availability instead (FR-ADM-05).
 */
function sortKeys(
  sort: SearchSort,
  score?: SQL<number>,
  price: SQL<number> | PgColumn = resolvedPiecePrice(null),
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
      return [asc(price), ...tiebreak];
    case 'price_desc':
      return [desc(price), ...tiebreak];
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
    case 'state':
      return [asc(statePriority), ...tiebreak];
    case 'state_desc':
      return [desc(statePriority), ...tiebreak];
    case 'relevance':
      // With nothing to score against, the useful order is not alphabetical:
      // it is what the grid was opened to deal with. A sync leaves its new
      // products unpublished, and those are what an admin came here for.
      return score ? sortKeys(sort, score) : [asc(statePriority), ...tiebreak];
    default:
      return sortKeys(sort, score);
  }
}

/**
 * What a row needs, as a number to sort by: nobody has looked at an unpublished
 * product yet, a live one is settled, and a deleted one is over. Columns are
 * qualified by hand — a bare name in a template binds to whatever table the
 * surrounding query happens to make available.
 */
const statePriority = sql<number>`case
  when ${products.deletedAt} is not null then 2
  when ${products.publishedAt} is null then 0
  else 1
end`;
