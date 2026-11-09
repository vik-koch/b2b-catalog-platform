import { Inject, Injectable } from '@nestjs/common';
import { inArray } from 'drizzle-orm';

import { Database } from '../../platform/db/database';
import { DRIZZLE } from '../../platform/db/database.module';
import { ProductOrders } from '../catalog/product-orders';
import { orderItems } from './ordering-schema';

@Injectable()
export class ProductOrderLines implements ProductOrders {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async orderedAmong(productIds: readonly string[]): Promise<Set<string>> {
    if (productIds.length === 0) return new Set();
    const rows = await this.db
      .selectDistinct({ productId: orderItems.productId })
      .from(orderItems)
      .where(inArray(orderItems.productId, [...productIds]));
    return new Set(rows.map((row) => row.productId));
  }
}
