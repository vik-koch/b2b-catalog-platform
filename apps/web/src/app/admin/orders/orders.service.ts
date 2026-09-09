import { Injectable } from '@angular/core';
import {
  AdminOrderDetail,
  OrderAdjustment,
  OrderAdjustmentPreview,
  OrderRevision,
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

/**
 * Why an adjustment was refused (FR-ORD-03). The codes the contract lists, so
 * the screen can word each one — never the exception's own text.
 */
export type AdjustmentRefusal =
  | 'order-changed'
  | 'no-change'
  | 'unknown-product'
  | 'unknown-tier'
  | 'line-not-priceable'
  | 'invalid-company-id'
  | 'unsupported-country'
  | 'invalid-postal-code'
  | 'unknown-pickup-location'
  | 'billing-details-required'
  | 'cash-not-available'
  | 'billing-address-required'
  | 'order-not-found';

export type AdjustmentResult =
  | { ok: true; order: AdminOrderDetail }
  | { ok: false; code: AdjustmentRefusal };

/** A row of the staff list: the order, plus who it came from. */
export type StaffOrderSummary = OrderSummary & {
  customerEmail: string | null;
  contactName: string;
  paymentMethod: PaymentMethod;
  /** Which version the row is describing, so its title can link straight at
   * it rather than at whatever is current when the link is followed. */
  revisionNumber: number;
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
    /** What the manager said in the confirmation: whether the move reaches the
     * customer's page, whether they hear about it, and whether the money
     * arrived with it. */
    told: { showCustomer: boolean; notify: boolean; markPaid: boolean },
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
   * Bring the customer's view of the order up to date, and mail them if asked
   * (FR-NOTIF-03). Null where there was nothing left to do — somebody else
   * brought them up to date while this page was open.
   */
  async notifyCustomer(
    reference: string,
    notify: boolean,
  ): Promise<AdminOrderDetail | null> {
    const result = await safe(
      this.client.notifyOrderCustomer({
        params: { reference },
        body: { notify },
      }),
    );
    if (result.isSuccess) return result.data;
    if (!result.isDefined) throw result.error;
    return null;
  }

  /** Every version of one order, newest first (FR-ORD-03). */
  async revisions(reference: string | undefined): Promise<OrderRevision[]> {
    if (!reference) return [];
    const { revisions } = await this.client.listOrderRevisions({
      params: { reference },
    });
    return revisions;
  }

  /** One version of it, for the screen that reads a version back. Null where
   * the order — or that version of it — is not there. */
  async revision(
    reference: string,
    number: number,
  ): Promise<OrderRevision | null> {
    const result = await safe(
      this.client.getOrderRevision({ params: { reference, number } }),
    );
    if (result.isDefined && result.error.code === 'order-not-found') {
      return null;
    }
    if (!result.isSuccess) throw result.error;
    return result.data;
  }

  /**
   * What the adjustment on screen would come to (FR-ORD-03) — priced by the
   * server, which is the only thing that prices an order.
   *
   * Refusals come back as codes here too: a manager typing a company number
   * into a form should see the rule the moment it is broken, not when they
   * press save.
   */
  async previewAdjustment(
    reference: string,
    body: OrderAdjustment,
  ): Promise<
    | { ok: true; preview: OrderAdjustmentPreview }
    | { ok: false; code: AdjustmentRefusal }
  > {
    const result = await safe(
      this.client.previewOrderAdjustment({ params: { reference }, body }),
    );
    if (result.isSuccess) return { ok: true, preview: result.data };
    if (!result.isDefined) throw result.error;
    return { ok: false, code: result.error.code as AdjustmentRefusal };
  }

  /** Write it (FR-ORD-03): a new version of the order, answered with the
   * order as the server now holds it. */
  async adjust(
    reference: string,
    body: OrderAdjustment,
  ): Promise<AdjustmentResult> {
    const result = await safe(
      this.client.adjustOrder({ params: { reference }, body }),
    );
    if (result.isSuccess) return { ok: true, order: result.data };
    if (!result.isDefined) throw result.error;
    return { ok: false, code: result.error.code as AdjustmentRefusal };
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
