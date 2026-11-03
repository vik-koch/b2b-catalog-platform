import { Inject, Injectable } from '@nestjs/common';
import { and, count, eq, notInArray } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { ENDED_ORDER_STATUSES } from '@b2b-catalog-platform/shared/core/ordering';
import { DRIZZLE } from '../../db/database.module';
import * as schema from '../../db/schema';
import { orders } from '../../db/schema';
import { AccountOrders } from '../accounts/account-orders';

@Injectable()
export class OrderCounts implements AccountOrders {
  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof schema>,
  ) {}

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
