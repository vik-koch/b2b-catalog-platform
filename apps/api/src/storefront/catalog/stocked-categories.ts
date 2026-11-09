import { products } from '../../core/catalog/catalog-schema';
import { CategoryRow } from '../../core/catalog/catalog-tree';
import { publiclyVisible } from '../../core/catalog/product-view';
import { Database } from '../../platform/db/database';
import { stockedCategoryIds } from './category-tree';

/** The categories worth linking to, read from where the visible products sit:
 * what is not stocked is not linked to. */
export async function stockedCategories(
  db: Database,
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
