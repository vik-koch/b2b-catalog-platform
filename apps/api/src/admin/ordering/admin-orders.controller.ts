import { Controller } from '@nestjs/common';
import { Implement, implement } from '@orpc/nest';
import { adminOrdersContract } from '@b2b-catalog-platform/shared/admin/ordering';
import { Auth } from '../../platform/auth/auth.decorator';
import { CurrentUser } from '../../platform/auth/current-user.decorator';
import { AuditLogger } from '../../platform/audit/audit.logger';
import { refusals } from '../../platform/orpc/refusals';
import { ordersExternallyOwned } from '../../platform/settings/ownership.refusals';
import { OwnershipState } from '../../platform/settings/ownership-state';
import { OrderPersonalData } from '../../core/ordering/order-personal-data';
import { OrderReader } from '../../core/ordering/order-reader';
import { OrderWriter } from '../../core/ordering/order-writer';
import { StaffOrdersService } from './staff-orders.service';
import { AuthUser } from '@b2b-catalog-platform/shared/platform';

/**
 * Staff reading and answering orders (FR-AUTH-03, FR-ORD-01..04). The reads
 * share the customer's projection; the contract decides that only this view
 * carries the line prices and the price list.
 */
@Auth('admin', 'manager')
@Controller()
export class AdminOrdersController {
  constructor(
    private readonly orders: StaffOrdersService,
    private readonly reads: OrderReader,
    private readonly writer: OrderWriter,
    private readonly audit: AuditLogger,
    private readonly ownership: OwnershipState,
    private readonly personalData: OrderPersonalData,
  ) {}

  /**
   * Every act on an order, closed while an external system owns order
   * processing (FR-ADM-10). Not a guard: it is the platform's state, not the
   * caller's permission. Reads stay open.
   */
  private refuseIfOwned(action: string): void {
    if (this.ownership.isExternallyOwned('orders')) {
      throw ordersExternallyOwned(action);
    }
  }

  @Implement(adminOrdersContract.listOrders)
  listOrders() {
    return implement(adminOrdersContract.listOrders)
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

  @Implement(adminOrdersContract.getOrder)
  getOrder() {
    return implement(adminOrdersContract.getOrder)
      .use(refusals)
      .handler(({ input: { params } }) =>
        this.reads.getForStaff(params.reference),
      );
  }

  /**
   * Whether the move is allowed is the service's answer; here is the audit. The
   * mail cannot fail the move.
   */
  @Implement(adminOrdersContract.transitionOrder)
  transitionOrder(@CurrentUser() actor: AuthUser) {
    return implement(adminOrdersContract.transitionOrder)
      .use(refusals)
      .handler(async ({ input: { params, body } }) => {
        this.refuseIfOwned('move an order');
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
        // Two acts, two lines: a filter for payments must not need to know some
        // arrived through a move.
        if (body.markPaid) {
          this.audit.record('order.paid', actor, {
            reference: order.reference,
          });
        }
        return order;
      });
  }

  /** Every version of one order (FR-ORD-03), for staff: a customer reads the
   * order as it stands. */
  @Implement(adminOrdersContract.listOrderRevisions)
  listOrderRevisions() {
    return implement(adminOrdersContract.listOrderRevisions)
      .use(refusals)
      .handler(async ({ input: { params } }) => ({
        revisions: await this.orders.getRevisions(params.reference),
      }));
  }

  /** One version of it, for the screen that reads a version back. */
  @Implement(adminOrdersContract.getOrderRevision)
  getOrderRevision() {
    return implement(adminOrdersContract.getOrderRevision)
      .use(refusals)
      .handler(({ input: { params } }) =>
        this.orders.getRevision(params.reference, params.number),
      );
  }

  @Implement(adminOrdersContract.previewOrderAdjustment)
  previewOrderAdjustment() {
    return implement(adminOrdersContract.previewOrderAdjustment)
      .use(refusals)
      .handler(({ input: { params, body } }) => {
        this.refuseIfOwned('price an adjustment');
        return this.orders.previewAdjustment(params.reference, body);
      });
  }

  /**
   * A new version of the order (FR-ORD-03), audited by its number: the
   * reference alone does not say which version. Mails only where `notify` asks.
   */
  @Implement(adminOrdersContract.adjustOrder)
  adjustOrder(@CurrentUser() actor: AuthUser) {
    return implement(adminOrdersContract.adjustOrder)
      .use(refusals)
      .handler(async ({ input: { params, body } }) => {
        this.refuseIfOwned('adjust an order');
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

  /**
   * Brings the customer's page up and mails them if asked (FR-NOTIF-03): for
   * the change no move will mention, or a mail somebody decided against.
   */
  @Implement(adminOrdersContract.notifyOrderCustomer)
  notifyOrderCustomer(@CurrentUser() actor: AuthUser) {
    return implement(adminOrdersContract.notifyOrderCustomer)
      .use(refusals)
      .handler(async ({ input: { params, body } }) => {
        this.refuseIfOwned("move the customer's view");
        const order = await this.orders.showCustomerCurrent(
          params.reference,
          body.notify,
        );
        this.audit.record('order.customer_notified', actor, {
          reference: order.reference,
          revision: order.revisionNumber,
        });
        return order;
      });
  }

  @Implement(adminOrdersContract.setOrderPayment)
  setOrderPayment(@CurrentUser() actor: AuthUser) {
    return implement(adminOrdersContract.setOrderPayment)
      .use(refusals)
      .handler(async ({ input: { params, body } }) => {
        this.refuseIfOwned('record a payment');
        const order = await this.writer.setPayment(
          params.reference,
          body.paid,
          actor.id,
        );
        this.audit.record(body.paid ? 'order.paid' : 'order.unpaid', actor, {
          reference: order.reference,
        });
        // No mail either way: a ticked or unticked box changes nothing for the
        // customer, and their page says what is owed.
        return order;
      });
  }

  /**
   * A guest's request to remove their details (NFR-LEGAL-14): an admin's alone,
   * and never refused by the ownership switch.
   */
  @Auth('admin')
  @Implement(adminOrdersContract.removeOrderPersonalData)
  removeOrderPersonalData(@CurrentUser() actor: AuthUser) {
    return implement(adminOrdersContract.removeOrderPersonalData)
      .use(refusals)
      .handler(async ({ input: { params } }) => {
        await this.personalData.removeOnRequest(params.reference, actor);
        this.audit.record('order.personalDataRemoved', actor, {
          reference: params.reference,
        });
        return this.reads.getForStaff(params.reference);
      });
  }
}
