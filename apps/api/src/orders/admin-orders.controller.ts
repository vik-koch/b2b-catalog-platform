import { Controller } from '@nestjs/common';
import { Implement, implement } from '@orpc/nest';
import { AuthUser, ordersContract } from '@b2b-catalog-platform/shared';
import { Auth } from '../auth/auth.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuditLogger } from '../audit/audit.logger';
import { refusals } from '../orpc/refusals';
import { OrdersService } from './orders.service';

/**
 * The staff view of order requests (FR-AUTH-03), and the moves a manager makes
 * on them (FR-ORD-01/02/04).
 *
 * The same service as the customer's own routes, so the two views cannot
 * describe an order differently; what separates them is the contract, which
 * lets only this one carry the price basis, the private source id and the tier
 * the order was priced from.
 */
@Auth('admin', 'manager')
@Controller()
export class AdminOrdersController {
  constructor(
    private readonly orders: OrdersService,
    private readonly audit: AuditLogger,
  ) {}

  @Implement(ordersContract.listOrders)
  listOrders() {
    return implement(ordersContract.listOrders)
      .use(refusals)
      .handler(({ input: { query } }) =>
        this.orders.listAll(
          query.page ?? 1,
          query.status,
          query.q,
          query.sort ?? 'status',
          query.payment,
        ),
      );
  }

  @Implement(ordersContract.getOrder)
  getOrder() {
    return implement(ordersContract.getOrder)
      .use(refusals)
      .handler(({ input: { params } }) =>
        this.orders.getForStaff(params.reference),
      );
  }

  /**
   * Whether the move is allowed is the service's answer, not this controller's
   * — the transition table is asked in one place for every caller. What lives
   * here is what follows a move that happened: the audit line, and the mail
   * the customer is owed (FR-NOTIF-03).
   *
   * The mail cannot fail the transition, exactly as the receipt cannot fail an
   * order: the row is the record, and a manager who accepted an order accepted
   * it whether or not SMTP was reachable.
   */
  @Implement(ordersContract.transitionOrder)
  transitionOrder(@CurrentUser() actor: AuthUser) {
    return implement(ordersContract.transitionOrder)
      .use(refusals)
      .handler(async ({ input: { params, body } }) => {
        const order = await this.orders.transitionForStaff(
          params.reference,
          body.to,
          body.reason,
          actor.id,
        );
        this.audit.record('order.status', actor, {
          reference: order.reference,
          status: order.status,
        });
        await this.orders.notifyStatusChanged(order.reference);
        return order;
      });
  }

  @Implement(ordersContract.setOrderPayment)
  setOrderPayment(@CurrentUser() actor: AuthUser) {
    return implement(ordersContract.setOrderPayment)
      .use(refusals)
      .handler(async ({ input: { params, body } }) => {
        const order = await this.orders.setPayment(
          params.reference,
          body.paid,
          actor.id,
        );
        this.audit.record(body.paid ? 'order.paid' : 'order.unpaid', actor, {
          reference: order.reference,
        });
        // Deliberately no mail either way: nothing about the order changed for
        // the customer, and being written to because the shop ticked a box off
        // — or unticked one it should not have — is noise. The order's own
        // page says what it owes.
        return order;
      });
  }
}
