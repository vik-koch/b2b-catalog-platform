import { Injectable } from '@angular/core';
import {
  AdminOrderDetail,
  OrderStatus,
  OrderSummary,
  ordersContract,
  Pagination,
} from '@b2b-catalog-platform/shared';
import { createApiClient } from '../../core/api-client';

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
  private readonly client = createApiClient(ordersContract);

  async list(query: {
    page: number;
    status?: OrderStatus;
    q?: string;
  }): Promise<{ items: StaffOrderSummary[]; pagination: Pagination }> {
    const response = await this.client.listOrders({ query });
    if (response.status === 200) return response.body;
    throw new Error(`Failed to load the orders (status ${response.status})`);
  }

  /** One order in full. Null where the reference opens nothing. */
  async get(reference: string): Promise<AdminOrderDetail | null> {
    const response = await this.client.getOrder({ params: { reference } });
    if (response.status === 200) return response.body;
    if (response.status === 404) return null;
    throw new Error(`Failed to load the order (status ${response.status})`);
  }
}
