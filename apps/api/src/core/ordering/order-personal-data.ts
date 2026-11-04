import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { isOrderFinished } from '@b2b-catalog-platform/shared/core/ordering';
import { DRIZZLE } from '../../db/database.module';
import * as schema from '../../db/schema';
import { orders } from '../../db/schema';
import {
  ORDER_REMOVAL_CATEGORIES,
  recordDestruction,
} from '../../platform/destruction-record';
import { OrderDocumentFiles } from './order-document-files';
import { scrubOrders } from './order-scrub';

/**
 * A guest's request to remove their order's details (NFR-LEGAL-14): they have
 * no account to delete. Not an account holder's order (FR-ADM-23), and not one
 * still running.
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
      // Locked, so a reopen cannot slip between the check and the scrub.
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
    // After the commit: a file cannot be rolled back with the rows.
    await this.documents.removeForOrders([id]);
  }
}
