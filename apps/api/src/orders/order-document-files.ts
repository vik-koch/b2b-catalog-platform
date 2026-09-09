import { Inject, Injectable } from '@nestjs/common';
import { eq, inArray } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DRIZZLE } from '../db/database.module';
import * as schema from '../db/schema';
import { orderDocuments, orders } from '../db/schema';
import { MEDIA_STORE, MediaStore } from '../media/media-store';

/**
 * Erasing an account's supplied order documents (FR-AUTH-06, ADR 0052).
 *
 * Its own small service rather than a method on `OrderDocumentsService`,
 * because it is used from the other end of the app — closing an account —
 * and needs none of what drawing a document needs. Wiring the PDF renderer
 * into the deletion path to delete a file would be a dependency nobody
 * reading either side would expect.
 *
 * Anonymization scrubs the columns it can read. A supplied PDF is bytes with
 * the customer's name, address and prices in it that no column-level scrub can
 * reach, so it goes entirely. The generated summary needs no rule of its own:
 * it is drawn from a revision that has just been scrubbed.
 */
@Injectable()
export class OrderDocumentFiles {
  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof schema>,
    @Inject(MEDIA_STORE) private readonly store: MediaStore,
  ) {}

  /** Returns how many were removed, for the deletion's own log. */
  async removeForUser(userId: string): Promise<number> {
    const mine = this.db
      .select({ id: orders.id })
      .from(orders)
      .where(eq(orders.userId, userId));
    const rows = await this.db
      .select()
      .from(orderDocuments)
      .where(inArray(orderDocuments.orderId, mine));
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
