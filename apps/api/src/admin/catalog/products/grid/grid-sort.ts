import { asc, desc, sql, SQL } from 'drizzle-orm';
import { AdminProductSort } from '@b2b-catalog-platform/shared/admin/catalog';
import { products } from '../../../../db/schema';
import {
  OrderBy,
  productSortKeys,
} from '../../../../core/catalog/product-sort';

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
      return score
        ? productSortKeys(sort, score)
        : [asc(statePriority), ...tiebreak];
    default:
      return productSortKeys(sort, score);
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
