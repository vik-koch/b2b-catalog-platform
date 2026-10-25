import * as z from 'zod';
import {
  priceMinorSchema,
  productDetailSchema,
  productListItemSchema,
  unitPricesSchema,
} from './catalog.contract';

/*
 * What edit mode reads on a storefront page: the storefront's own shapes, for
 * products the public cannot see, with the reason why. Served by staff routes,
 * drawn by storefront pages for an admin.
 */

/**
 * An unpublished product — the edit-mode overlay under a category grid. The
 * public tile shape with the price it may lack, which is the one reason
 * publishing alone will not bring it to the storefront.
 */
export const hiddenProductSchema = productListItemSchema.extend({
  /** Null where no price list prices this product — which is one of the
   * reasons it is down here, and the only one the storefront's own tile shape
   * cannot express. */
  priceMinor: priceMinorSchema.nullable(),
  prices: unitPricesSchema.nullable(),
});
export type HiddenProduct = z.infer<typeof hiddenProductSchema>;

/**
 * A product's page as an admin is shown it (FR-ADM-06): the storefront's own
 * shape, for any product, with why the public cannot see it. Every reason
 * false is a live product. An unpriced product's price reads as zero, as the
 * editor's preview draws it; `unpriced` is what says it has none.
 */
export const productPageSchema = z
  .object({
    product: productDetailSchema,
    hidden: z
      .object({
        deleted: z.boolean(),
        /** Who undoes the deletion (FR-ADM-10). */
        deletedByRun: z.boolean(),
        unpublished: z.boolean(),
        unpriced: z.boolean(),
        /** On some order: never deleted permanently (FR-ADM-21). */
        ordered: z.boolean(),
      })
      .strict(),
  })
  .strict();
export type ProductPage = z.infer<typeof productPageSchema>;
