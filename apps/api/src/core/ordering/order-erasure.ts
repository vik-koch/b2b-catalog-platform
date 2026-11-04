import { Injectable, Logger } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { orders } from '../../platform/db/schema';
import {
  AccountErasureStep,
  ErasedAccount,
  Tx,
} from '../accounts/account-erasure';
import { OrderDocumentFiles } from './order-document-files';
import { scrubOrders } from './order-scrub';

/** What an account's erasure does to its orders (FR-AUTH-06). */
@Injectable()
export class OrderErasure implements AccountErasureStep {
  private readonly logger = new Logger('AccountDeletion');

  constructor(private readonly documents: OrderDocumentFiles) {}

  async erase(tx: Tx, { userId }: ErasedAccount): Promise<void> {
    // "Past orders are kept for our bookkeeping, with your details removed."
    await scrubOrders(
      tx,
      tx
        .select({ id: orders.id })
        .from(orders)
        .where(eq(orders.userId, userId)),
    );
  }

  /** The files supplied for its orders, which no column-level scrub reaches. */
  async afterCommit({ userId }: ErasedAccount): Promise<void> {
    const removed = await this.documents.removeForUser(userId);
    if (removed > 0) {
      this.logger.log(`Removed ${removed} supplied order document(s)`);
    }
  }
}
