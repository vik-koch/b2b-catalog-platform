import { Inject, Injectable } from '@nestjs/common';
import { eq, inArray } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DRIZZLE } from '../../platform/db/database.module';
import * as schema from '../../platform/db/schema';
import { orderDocuments, orders } from '../../platform/db/schema';
import { MEDIA_STORE, MediaStore } from '../../platform/media/media-store';
import { OrderIds } from './order-scrub';

/**
 * Deletes the files supplied for orders whose personal details go (FR-AUTH-06,
 * NFR-LEGAL-14): bytes no column-level scrub can reach. Apart from
 * `OrderDocumentsService` so the deletion path needs no PDF renderer.
 */
@Injectable()
export class OrderDocumentFiles {
  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof schema>,
    @Inject(MEDIA_STORE) private readonly store: MediaStore,
  ) {}

  /** Returns how many were removed, for the deletion's own log. */
  async removeForUser(userId: string): Promise<number> {
    return this.remove(
      this.db
        .select({ id: orders.id })
        .from(orders)
        .where(eq(orders.userId, userId)),
    );
  }

  /** The same for orders whose details went on their own (NFR-LEGAL-14):
   * at the end of their retention, or on a guest's request. */
  async removeForOrders(orderIds: readonly string[]): Promise<number> {
    if (orderIds.length === 0) return 0;
    return this.remove([...orderIds]);
  }

  private async remove(ids: OrderIds): Promise<number> {
    const rows = await this.db
      .select()
      .from(orderDocuments)
      .where(inArray(orderDocuments.orderId, ids));
    if (rows.length === 0) return 0;

    await this.db.delete(orderDocuments).where(
      inArray(
        orderDocuments.id,
        rows.map((row) => row.id),
      ),
    );
    // After the rows, so an interrupted deletion leaves collectable bytes
    // rather than a row pointing at a file that is gone.
    await Promise.all(rows.map((row) => this.store.deletePrivate(row.fileKey)));
    return rows.length;
  }
}
