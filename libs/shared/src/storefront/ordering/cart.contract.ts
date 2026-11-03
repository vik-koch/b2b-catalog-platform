import { oc } from '@orpc/contract';
import * as z from 'zod';
import { CART_LINES_MAX } from '../../core/ordering/cart';
import {
  cartLineSchema,
  cartPreviewSchema,
} from '../../core/ordering/cart.contract';

export const cartRequestSchema = z
  .object({ lines: z.array(cartLineSchema).max(CART_LINES_MAX) })
  .strict();

/**
 * Pricing a cart (FR-CART-01/02). The cart lives in the browser, so every
 * call carries all of it and is answered with what it costs now.
 */
export const cartContract = {
  previewCart: oc
    .route({
      method: 'POST',
      path: '/cart/preview',
      inputStructure: 'detailed',
      summary: 'Price a cart as it stands, with per-line advisories',
    })
    .input(z.object({ body: cartRequestSchema }))
    .output(cartPreviewSchema),
};
