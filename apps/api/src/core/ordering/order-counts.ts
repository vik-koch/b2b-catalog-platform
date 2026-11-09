import { Inject, Injectable } from '@nestjs/common';
import { and, count, eq, notInArray } from 'drizzle-orm';

import { ENDED_ORDER_STATUSES } from '@b2b-catalog-platform/shared/core/ordering';

import { Database } from '../../platform/db/database';
import { DRIZZLE } from '../../platform/db/database.module';
import { AccountOrders } from '../accounts/account-orders';
import { orders } from './ordering-schema';

@Injectable()
export class OrderCounts implements AccountOrders {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async countOpen(userId: string): Promise<number> {
    const [row] = await this.db
      .select({ open: count() })
      .from(orders)
      .where(
        and(
          eq(orders.userId, userId),
          notInArray(orders.status, [...ENDED_ORDER_STATUSES, 'completed']),
        ),
      );
    return Number(row?.open ?? 0);
  }

  async count(userId: string): Promise<number> {
    const [row] = await this.db
      .select({ total: count() })
      .from(orders)
      .where(eq(orders.userId, userId));
    return Number(row?.total ?? 0);
  }
}
