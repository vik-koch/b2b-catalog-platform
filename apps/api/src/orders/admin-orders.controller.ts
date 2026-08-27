import { Controller } from '@nestjs/common';
import { tsRestHandler, TsRestHandler } from '@ts-rest/nest';
import { ordersContract } from '@b2b-catalog-platform/shared';
import { Auth } from '../auth/auth.decorator';
import { OrdersService } from './orders.service';

/**
 * The staff view of order requests (FR-AUTH-03: a manager views all orders).
 * Read-only in this iteration — the status transitions arrive with order
 * processing.
 *
 * The same service as the customer's own routes, so the two views cannot
 * describe an order differently; what separates them is the contract, which
 * lets only this one carry the price basis, the private source id and the tier
 * the order was priced from.
 */
@Auth('admin', 'manager')
@Controller()
export class AdminOrdersController {
  constructor(private readonly orders: OrdersService) {}

  @TsRestHandler(ordersContract.listOrders, { validateResponses: true })
  listOrders() {
    return tsRestHandler(ordersContract.listOrders, async ({ query }) => ({
      status: 200 as const,
      body: await this.orders.listAll(query.page ?? 1, query.status, query.q),
    }));
  }

  @TsRestHandler(ordersContract.getOrder, { validateResponses: true })
  getOrder() {
    return tsRestHandler(ordersContract.getOrder, async ({ params }) => ({
      status: 200 as const,
      body: await this.orders.getForStaff(params.reference),
    }));
  }
}
