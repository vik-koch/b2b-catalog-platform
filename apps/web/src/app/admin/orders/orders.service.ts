import { Injectable } from '@angular/core';
import {
  AdminOrderDetail,
  OrderStatus,
  OrderSummary,
  Pagination,
  PaymentMethod,
  StaffOrderSort,
  StaffPaymentFilter,
  TransitionTarget,
} from '@b2b-catalog-platform/shared';
import { ordersContract } from '../../core/contract-routes.generated';
import { safe } from '@orpc/client';
import { createOrpcClient } from '../../core/orpc-client';

/** A row of the staff list: the order, plus who it came from. */
export type StaffOrderSummary = OrderSummary & {
  customerEmail: string | null;
  contactName: string;
  paymentMethod: PaymentMethod;
};

/**
 * The staff view of order requests (FR-AUTH-03). The customer's own routes are
 * a different service against the same contract, because they are a different
 * projection of the same order: only these ones carry the price basis, who
 * placed it and which list it was priced from.
 */
@Injectable({ providedIn: 'root' })
export class AdminOrdersService {
  private readonly client = createOrpcClient(ordersContract);

  async list(query: {
    page: number;
    status?: OrderStatus;
    payment?: StaffPaymentFilter;
    q?: string;
    sort?: StaffOrderSort;
  }): Promise<{ items: StaffOrderSummary[]; pagination: Pagination }> {
    return this.client.listOrders({ query });
  }

  /** One order in full. Null where the reference opens nothing. */
  async get(reference: string): Promise<AdminOrderDetail | null> {
    const result = await safe(this.client.getOrder({ params: { reference } }));
    if (result.isDefined && result.error.code === 'order-not-found') {
      return null;
    }
    if (!result.isSuccess) throw result.error;
    return result.data;
  }

  /**
   * Move an order (FR-ORD-01/02), answering with it as the server now holds
   * it. Null where the move was refused — the order was answered by somebody
   * else while this page was open, which is not an error worth throwing over:
   * the page reloads and shows what it actually is now.
   */
  async transition(
    reference: string,
    to: TransitionTarget,
    reason: string | null,
    /** What the manager said in the confirmation: whether the customer hears
     * about this move, and whether the money arrived with it. */
    told: { notify: boolean; markPaid: boolean },
  ): Promise<AdminOrderDetail | null> {
    const result = await safe(
      this.client.transitionOrder({
        params: { reference },
        body: { to, reason, ...told },
      }),
    );
    if (result.isSuccess) return result.data;
    if (!result.isDefined) throw result.error;
    return null;
  }

  /**
   * Bring the customer's view of the order up to date and mail them
   * (FR-NOTIF-03). Null where there was nothing to tell — somebody else told
   * them while this page was open.
   */
  async notifyCustomer(reference: string): Promise<AdminOrderDetail | null> {
    const result = await safe(
      this.client.notifyOrderCustomer({ params: { reference } }),
    );
    if (result.isSuccess) return result.data;
    if (!result.isDefined) throw result.error;
    return null;
  }


  /** Record that the money arrived, or take that record back (FR-ORD-04).
   * Null where there was nothing to change — already in that state, or an
   * order that ended. */
  async setPayment(
    reference: string,
    paid: boolean,
  ): Promise<AdminOrderDetail | null> {
    const result = await safe(
      this.client.setOrderPayment({ params: { reference }, body: { paid } }),
    );
    if (result.isSuccess) return result.data;
    if (!result.isDefined) throw result.error;
    return null;
  }
}
