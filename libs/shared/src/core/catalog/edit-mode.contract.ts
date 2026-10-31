/**
 * Products the public cannot see, in the storefront's own shapes. Served by
 * staff routes and drawn by storefront pages, so they sit in core.
 */

import * as z from 'zod';
import {
  productDetailSchema,
  productListItemSchema,
  unitPricesSchema,
} from './catalog.contract';

/** An unpublished product in the overlay under a category grid. */
export const hiddenProductSchema = productListItemSchema.extend({
  /** Null where no price list prices it: one reason it is hidden, and the
   * one the tile shape cannot express. */
  prices: unitPricesSchema.nullable(),
});
export type HiddenProduct = z.infer<typeof hiddenProductSchema>;

/** Why the public cannot see a product. All false is a live product. */
export const hiddenReasonsSchema = z
  .object({
    deleted: z.boolean(),
    /** Who undoes the deletion (FR-ADM-10). */
    deletedByRun: z.boolean(),
    unpublished: z.boolean(),
    unpriced: z.boolean(),
    /** On some order: never deleted permanently (FR-ADM-21). */
    ordered: z.boolean(),
  })
  .strict();
export type HiddenReasons = z.infer<typeof hiddenReasonsSchema>;

/**
 * Any product's page as an admin sees it (FR-ADM-06). An unpriced product's
 * price reads as zero, as the editor's preview draws it.
 */
export const productPageSchema = z
  .object({
    product: productDetailSchema,
    hidden: hiddenReasonsSchema,
  })
  .strict();
export type ProductPage = z.infer<typeof productPageSchema>;
