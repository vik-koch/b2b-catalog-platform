import {
  MyOrderFilter,
  OrderDetail,
  OrderSummary,
} from '@b2b-catalog-platform/shared/core/ordering';
import { Pagination } from '@b2b-catalog-platform/shared/platform';
import { Injectable, Logger } from '@nestjs/common';
import { and, eq, SQL } from 'drizzle-orm';
import { toSummary } from '../../core/ordering/order-rows';
import { OrderReader } from '../../core/ordering/order-reader';
import { OrderWriter } from '../../core/ordering/order-writer';
import { orderRevisions, orders } from '../../db/schema';
import { OrderNotifications } from '../../core/ordering/order-notifications';

/** A customer's own orders (FR-ACC-01): their list, and calling one off. */
@Injectable()
export class CustomerOrdersService {
  private readonly logger = new Logger('Orders');

  constructor(
    private readonly reads: OrderReader,
    private readonly writer: OrderWriter,
    private readonly notifications: OrderNotifications,
  ) {}

  async listForUser(
    userId: string,
    page = 1,
    state?: MyOrderFilter,
  ): Promise<{ items: OrderSummary[]; pagination: Pagination }> {
    const conditions: SQL[] = [eq(orders.userId, userId)];
    const waiting = this.myOrderCondition(state);
    if (waiting) conditions.push(waiting);
    return this.list(and(...conditions) as SQL, page);
  }

  /**
   * What waits on the account holder (FR-WORK-03), as the two filters their
   * own panel links to. Each is the same question the work queue counts, so a
   * marker and the list it opens can never disagree — and the fulfilment
   * method is read off the version the customer is on, which is the version
   * this list joins anyway.
   */
  private myOrderCondition(filter?: MyOrderFilter): SQL | undefined {
    if (!filter) return undefined;
    return filter === 'to-pay'
      ? eq(orders.paymentState, 'awaiting')
      : (and(
          eq(orders.status, 'ready'),
          eq(orderRevisions.fulfilmentMethod, 'pickup'),
        ) as SQL);
  }

  /**
   * A customer calling their own order off. Scoped to their own rows in the
   * `where`, so an order belonging to somebody else is a 404 before the
   * transition table is even consulted.
   */
  async cancelForUser(
    userId: string,
    reference: string,
    reason: string | null,
  ): Promise<OrderDetail> {
    const moved = await this.writer.move(
      and(eq(orders.reference, reference), eq(orders.userId, userId)),
      'customer',
      'cancelled',
      reason,
      userId,
    );
    // The shop is told (FR-NOTIF-07). Read as staff, because the mail is the
    // shop's: it states the money recorded against the order, which is not on
    // the customer's projection at all. Swallowed like every other order mail:
    // the customer has called their order off either way, and answering them
    // an error for a cancellation that happened would invite them to try again.
    try {
      await this.notifications.cancelledByCustomer(
        await this.reads.staffDetail(
          await this.reads.row(eq(orders.id, moved.id)),
        ),
      );
    } catch (error) {
      this.logger.error(
        `Could not tell the shop about the cancelled order ${reference}`,
        error,
      );
    }
    return this.reads.toDetail(
      moved,
      undefined,
      await this.reads.customerDocuments(moved),
    );
  }

  private async list(
    where: SQL,
    page: number,
  ): Promise<{ items: OrderSummary[]; pagination: Pagination }> {
    const { rows, pagination } = await this.reads.page(
      where,
      page,
      'placed_desc',
      {
        as: 'customer',
      },
    );
    const counts = await this.reads.itemCounts(
      rows.map((row) => row.revisionId),
    );
    return {
      items: rows.map((row) => toSummary(row, counts.get(row.revisionId) ?? 0)),
      pagination,
    };
  }
}
