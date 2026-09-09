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
   * here is the record of what a person did: the audit lines.
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
          body,
          actor.id,
        );
        this.audit.record('order.status', actor, {
          reference: order.reference,
          status: order.status,
          revision: order.revisionNumber,
        });
        // A move that also recorded the money is two things a manager did, so
        // it is two lines: a filter asking which orders were paid, and when,
        // must not have to know that some payments arrived through a move.
        if (body.markPaid) {
          this.audit.record('order.paid', actor, {
            reference: order.reference,
          });
        }
        return order;
      });
  }

  /** Every version of one order (FR-ORD-03) — staff only, since a customer
   * reads the order as it now stands. */
  @Implement(ordersContract.listOrderRevisions)
  listOrderRevisions() {
    return implement(ordersContract.listOrderRevisions)
      .use(refusals)
      .handler(async ({ input: { params } }) => ({
        revisions: await this.orders.getRevisions(params.reference),
      }));
  }

  /** One version of it, for the screen that reads a version back. */
  @Implement(ordersContract.getOrderRevision)
  getOrderRevision() {
    return implement(ordersContract.getOrderRevision)
      .use(refusals)
      .handler(({ input: { params } }) =>
        this.orders.getRevision(params.reference, params.number),
      );
  }

  @Implement(ordersContract.previewOrderAdjustment)
  previewOrderAdjustment() {
    return implement(ordersContract.previewOrderAdjustment)
      .use(refusals)
      .handler(({ input: { params, body } }) =>
        this.orders.previewAdjustment(params.reference, body),
      );
  }

  /**
   * A new version of the order (FR-ORD-03). Audited by the version it wrote,
   * since that is the thing that now exists — the reference alone would not
   * say which of an order's versions a line refers to.
   *
   * Nothing is mailed here. Whether the customer hears about a change is the
   * service's decision, taken with the move that follows it or with the
   * `notify` flag this carries.
   */
  @Implement(ordersContract.adjustOrder)
  adjustOrder(@CurrentUser() actor: AuthUser) {
    return implement(ordersContract.adjustOrder)
      .use(refusals)
      .handler(async ({ input: { params, body } }) => {
        const order = await this.orders.adjust(
          params.reference,
          body,
          actor.id,
        );
        this.audit.record('order.adjusted', actor, {
          reference: order.reference,
          revision: order.revisionNumber,
          status: order.status,
        });
        return order;
      });
  }

  /** Show the customer where the order got to, and tell them (FR-NOTIF-03) —
   * for the change that no move will ever mention. */
  @Implement(ordersContract.notifyOrderCustomer)
  notifyOrderCustomer(@CurrentUser() actor: AuthUser) {
    return implement(ordersContract.notifyOrderCustomer)
      .use(refusals)
      .handler(async ({ input: { params } }) => {
        const order = await this.orders.showCustomerCurrent(params.reference);
        this.audit.record('order.customer_notified', actor, {
          reference: order.reference,
          revision: order.revisionNumber,
        });
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
