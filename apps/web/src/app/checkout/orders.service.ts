import { Injectable } from '@angular/core';
import {
  CartPreview,
  OrderSubmission,
  ordersContract,
} from '@b2b-catalog-platform/shared';
import { createApiClient } from '../core/api-client';

/**
 * What placing an order came to. The refusals are the ones the form has to
 * explain rather than throw: each names something on screen the customer can
 * correct.
 *
 * `cart-changed` carries the fresh pricing with it, so a cart that moved while
 * the form was being filled is shown corrected rather than answered with "try
 * again".
 */
export type SubmitOrderResult =
  | { ok: true; reference: string; publicToken: string }
  | {
      ok: false;
      code:
        | 'invalid-company-id'
        | 'unsupported-country'
        | 'unknown-pickup-location'
        | 'billing-details-required'
        | 'rejected';
    }
  | { ok: false; code: 'cart-changed'; preview: CartPreview };

/** Placing an order request and reading one back (FR-CART-03/04, FR-ACC-01). */
@Injectable({ providedIn: 'root' })
export class OrdersService {
  private readonly client = createApiClient(ordersContract);

  async submit(order: OrderSubmission): Promise<SubmitOrderResult> {
    const response = await this.client.submitOrder({ body: order });
    if (response.status === 201) return { ok: true, ...response.body };
    if (response.status === 400) {
      return { ok: false, code: response.body.code };
    }
    if (response.status === 409) {
      return {
        ok: false,
        code: 'cart-changed',
        preview: response.body.preview,
      };
    }
    throw new Error(`Failed to place the order (status ${response.status})`);
  }
}
