import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../../db/schema';
import { products } from '../../db/schema';
import { CategoryRow } from '../../core/catalog/catalog-tree';
import { publiclyVisible } from '../../core/catalog/product-view';
import { stockedCategoryIds } from './category-tree';

/** The categories worth linking to, read from where the visible products sit:
 * what is not stocked is not linked to. */
export async function stockedCategories(
  db: NodePgDatabase<typeof schema>,
  rows: Pick<CategoryRow, 'id' | 'parentId'>[],
): Promise<Set<string>> {
  const live = await db
    .selectDistinct({ id: products.categoryId })
    .from(products)
    .where(publiclyVisible);
  return stockedCategoryIds(
    rows,
    live.map((row) => row.id),
  );
}
