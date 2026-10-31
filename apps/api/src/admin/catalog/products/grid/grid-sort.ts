import { asc, desc, sql, SQL } from 'drizzle-orm';
import { AdminProductSort } from '@b2b-catalog-platform/shared/admin/catalog';
import { products } from '../../../../db/schema';
import {
  OrderBy,
  productSortKeys,
} from '../../../../core/catalog/product-sort';

/** The admin grid's ordering (FR-ADM-05): the shared keys, plus recency and
 * state, which only the admin has a use for. */
export function gridOrderBy(
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
      // Unscored, by state: a sync leaves its new products unpublished, and
      // those are what an admin opens the grid for.
      return score
        ? productSortKeys(sort, score)
        : [asc(statePriority), ...tiebreak];
    default:
      return productSortKeys(sort, score);
  }
}

/** What a row needs, as a number: unpublished first (nobody has looked at
 * it), then live, then deleted. */
const statePriority = sql<number>`case
  when ${products.deletedAt} is not null then 2
  when ${products.publishedAt} is null then 0
  else 1
end`;
