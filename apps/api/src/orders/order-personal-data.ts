import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { isOrderFinished } from '@b2b-catalog-platform/shared';
import { DRIZZLE } from '../db/database.module';
import * as schema from '../db/schema';
import { orders } from '../db/schema';
import {
  ORDER_REMOVAL_CATEGORIES,
  recordDestruction,
} from '../destruction/record-destruction';
import { OrderDocumentFiles } from './order-document-files';
import { scrubOrders } from './order-scrub';

/**
 * Removing a guest order's personal details on the guest's request
 * (NFR-LEGAL-14). A guest has no account to delete, so this is the one way
 * their request can be met before the order's retention ends.
 *
 * Refused for an account holder's order, whose details go with the account
 * (FR-ADM-23), and for an order still running, which the shop needs them to
 * fulfil.
 */
@Injectable()
export class OrderPersonalData {
  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof schema>,
    private readonly documents: OrderDocumentFiles,
  ) {}

  async removeOnRequest(
    reference: string,
    admin: { readonly id: string; readonly email: string },
  ): Promise<void> {
    const id = await this.db.transaction(async (tx) => {
      // Locked, so a manager reopening the order cannot slip in between the
      // check that it is finished and the scrub.
      const [order] = await tx
        .select({
          id: orders.id,
          userId: orders.userId,
          status: orders.status,
          paymentState: orders.paymentState,
          personalDataRemovedAt: orders.personalDataRemovedAt,
        })
        .from(orders)
        .where(eq(orders.reference, reference))
        .for('update');
      if (!order) {
        throw new NotFoundException({
          code: 'order-not-found',
          message: 'Order not found',
        });
      }
      if (order.userId) {
        throw new ConflictException({
          code: 'order-not-guest',
          message: "An account holder's orders go with their account",
        });
      }
      if (order.personalDataRemovedAt) {
        throw new ConflictException({
          code: 'personal-data-removed',
          message: "This order's personal details are already removed",
        });
      }
      if (!isOrderFinished(order.status, order.paymentState)) {
        throw new ConflictException({
          code: 'order-not-finished',
          message: 'The order is still running',
        });
      }

      await scrubOrders(tx, [order.id]);
      await recordDestruction(tx, {
        subject: 'order',
        subjectId: order.id,
        categories: ORDER_REMOVAL_CATEGORIES,
        reason: 'request',
        by: admin,
      });
      return order.id;
    });
    // After the commit, as an account deletion does: a file cannot be
    // rolled back with the rows.
    await this.documents.removeForOrders([id]);
  }
}
