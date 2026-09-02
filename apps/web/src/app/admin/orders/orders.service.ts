import { Injectable } from '@angular/core';
import {
  AdminOrderDetail,
  OrderStatus,
  OrderSummary,
  ordersContract,
  Pagination,
  StaffOrderSort,
} from '@b2b-catalog-platform/shared';
import { safe } from '@orpc/client';
import { createOrpcClient } from '../../core/orpc-client';

/** A row of the staff list: the order, plus who it came from. */
export type StaffOrderSummary = OrderSummary & {
  customerEmail: string | null;
  contactName: string;
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
}
