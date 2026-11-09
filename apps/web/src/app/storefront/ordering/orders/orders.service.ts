import { Injectable } from '@angular/core';
import { safe } from '@orpc/client';

import {
  CartPreview,
  MyOrderFilter,
  OrderDetail,
  OrderSubmission,
  OrderSummary,
} from '@b2b-catalog-platform/shared/core/ordering';
import { Pagination } from '@b2b-catalog-platform/shared/platform';

import { createOrpcClient } from '../../../platform/orpc-client';
import { ordersContract } from '../contract-routes.generated';

/**
 * What placing an order came to. Each refusal names something on screen the
 * customer can correct; `cart-changed` carries the fresh pricing to show.
 * `pairing-unsatisfied` reaches only a browser out of step with the cart page,
 * which disables its button on the same figures (FR-SET-04).
 */
export type SubmitOrderResult =
  | { ok: true; reference: string; publicToken: string }
  | {
      ok: false;
      code:
        | 'invalid-company-id'
        | 'unsupported-country'
        | 'invalid-postal-code'
        | 'unknown-pickup-location'
        | 'billing-details-required'
        | 'cash-not-available'
        | 'billing-address-required'
        | 'customer-type-not-accepted'
        | 'party-required'
        | 'staff-cannot-order'
        | 'pairing-unsatisfied'
        | 'rejected';
    }
  | { ok: false; code: 'cart-changed'; preview: CartPreview };

/** Placing an order and reading the customer's orders back (FR-CART-03/04,
 * FR-ACC-01). */
@Injectable({ providedIn: 'root' })
export class OrdersService {
  private readonly client = createOrpcClient(ordersContract);

  async submit(order: OrderSubmission): Promise<SubmitOrderResult> {
    const result = await safe(this.client.submitOrder({ body: order }));

    if (result.isSuccess) return { ok: true, ...result.data };
    if (!result.isDefined) throw result.error;

    return result.error.code === 'cart-changed'
      ? {
          ok: false,
          code: 'cart-changed',
          preview: result.error.data.preview,
        }
      : { ok: false, code: result.error.code };
  }

  /** The account's own order requests, newest first (FR-ACC-01). */
  async listMine(
    page: number,
    /** A queue waiting on the account holder (FR-WORK-03); absent for all. */
    state?: MyOrderFilter,
  ): Promise<{ items: OrderSummary[]; pagination: Pagination }> {
    return this.client.listMyOrders({ query: { page, state } });
  }

  /** Null where this account has no such order: somebody else's is a 404
   * too. */
  async getMine(reference: string): Promise<OrderDetail | null> {
    const result = await safe(
      this.client.getMyOrder({ params: { reference } }),
    );
    if (result.isDefined && result.error.code === 'order-not-found') {
      return null;
    }
    if (!result.isSuccess) throw result.error;
    return result.data;
  }

  /** False where the order moved on while the page was open (FR-ORD-02). */
  async cancelMine(reference: string, reason: string | null): Promise<boolean> {
    const result = await safe(
      this.client.cancelMyOrder({ params: { reference }, body: { reason } }),
    );
    if (result.isSuccess) return true;
    if (!result.isDefined) throw result.error;
    return false;
  }

  /** The order a mailed link opens (FR-NOTIF-06); the token is the whole
   * credential. */
  async getByToken(token: string): Promise<OrderDetail | null> {
    const result = await safe(
      this.client.getOrderByToken({ params: { token } }),
    );
    if (result.isDefined && result.error.code === 'order-not-found') {
      return null;
    }
    if (!result.isSuccess) throw result.error;
    return result.data;
  }
}
