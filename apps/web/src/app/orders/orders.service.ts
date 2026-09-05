import { Injectable } from '@angular/core';
import {
  CartPreview,
  OrderSubmission,
  OrderDetail,
  OrderSummary,
  Pagination,
} from '@b2b-catalog-platform/shared';
import { ordersContract } from '../core/contract-routes.generated';
import { safe } from '@orpc/client';
import { createOrpcClient } from '../core/orpc-client';

/**
 * What placing an order came to. The refusals are the ones the form has to
 * explain rather than throw: each names something on screen the customer can
 * correct.
 *
 * `cart-changed` carries the fresh pricing with it, so a cart that moved while
 * the form was being filled is shown corrected rather than answered with "try
 * again".
 *
 * `pairing-unsatisfied` only reaches a deployment that enforces pairings
 * (FR-SET-04), and only a browser out of step with the cart page, which
 * disables its own button on the same figures.
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
        | 'party-required'
        | 'staff-cannot-order'
        | 'pairing-unsatisfied'
        | 'rejected';
    }
  | { ok: false; code: 'cart-changed'; preview: CartPreview };

/**
 * Placing an order request and reading one back (FR-CART-03/04, FR-ACC-01).
 *
 * Lives here rather than under `checkout/` because the reading half outlives
 * the form: the account's order history and, later, the mailed summary a guest
 * opens are the same subject and the same contract.
 */
@Injectable({ providedIn: 'root' })
export class OrdersService {
  private readonly client = createOrpcClient(ordersContract);

  async submit(order: OrderSubmission): Promise<SubmitOrderResult> {
    const result = await safe(this.client.submitOrder({ body: order }));

    if (result.isSuccess) return { ok: true, ...result.data };
    if (!result.isDefined) throw result.error;

    // The one refusal that carries an answer: the fresh pricing rides along as
    // the error's own data, so the page can show what moved.
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
  ): Promise<{ items: OrderSummary[]; pagination: Pagination }> {
    return this.client.listMyOrders({ query: { page } });
  }

  /**
   * One of the account's own orders, by its reference. Null where there is no
   * such order *for this account* — the API answers 404 rather than 403 for
   * somebody else's, and the page has nothing else to say about either.
   */
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

  /**
   * The summary a mailed link opens (FR-NOTIF-06). The token is the whole
   * credential — no session is consulted, here or on the API — so a wrong or
   * stale one is simply an order nobody can open.
   */
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
