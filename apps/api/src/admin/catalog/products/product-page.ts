import { ProductPage } from '@b2b-catalog-platform/shared/core/catalog';
import { CatalogReader } from '../../../core/catalog/catalog-reader';

type ProductRead = NonNullable<
  Awaited<ReturnType<CatalogReader['readProduct']>>
>;

/**
 * Any product as its page shows it, with why the storefront does not
 * (FR-ADM-06): an admin's page falls back to this when the public read finds
 * nothing. Read with no tier, as staff have none; an unpriced product's price
 * reads as zero, and `unpriced` says it has none.
 */
export function productPageOf({ row, product }: ProductRead): ProductPage {
  return {
    product,
    hidden: {
      deleted: row.deletedAt !== null,
      deletedByRun: row.deletedAt !== null && row.deletedBy === null,
      unpublished: row.publishedAt === null,
      unpriced: row.priceMinor === null,
      ordered: row.orderLines > 0,
    },
  };
}
