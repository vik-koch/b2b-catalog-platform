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
import { orders } from '../../core/ordering/ordering-schema';
import { MY_ORDER_CONDITIONS } from '../../core/ordering/my-order-filters';
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
    const mine = eq(orders.userId, userId);
    return this.list(
      state ? (and(mine, MY_ORDER_CONDITIONS[state]) as SQL) : mine,
      page,
    );
  }

  /**
   * A customer calling their own order off; another's order is a 404 before the
   * transition table is asked.
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
    // The shop is told (FR-NOTIF-07), read as staff: the mail states money the
    // customer's view lacks. Swallowed: the cancellation happened either way.
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
