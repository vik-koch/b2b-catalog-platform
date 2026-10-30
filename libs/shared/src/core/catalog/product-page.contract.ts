/**
 * What edit mode reads on a storefront page: the storefront's own shapes, for
 * products the public cannot see, with the reason why. Served by staff routes,
 * drawn by storefront pages.
 */

import * as z from 'zod';
import {
  priceMinorSchema,
  productDetailSchema,
  productListItemSchema,
  unitPricesSchema,
} from './catalog.contract';

/** An unpublished product in the edit-mode overlay under a category grid. */
export const hiddenProductSchema = productListItemSchema.extend({
  /** Null where no price list prices it: one reason it is hidden, and the
   * one the tile shape cannot express. */
  priceMinor: priceMinorSchema.nullable(),
  prices: unitPricesSchema.nullable(),
});
export type HiddenProduct = z.infer<typeof hiddenProductSchema>;

/**
 * Any product's page as an admin sees it (FR-ADM-06), with why the public
 * cannot. All reasons false is a live product. An unpriced product's price
 * reads as zero, as the editor's preview draws it.
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
