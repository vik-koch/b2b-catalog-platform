import { inArray, sql, SQLWrapper } from 'drizzle-orm';
import { orderItems, orderRevisions, orders } from './ordering-schema';
import { Database } from '../../platform/db/database';

type Writer = Pick<Database, 'update' | 'select'>;

/** The orders to scrub: their ids, or a subquery selecting them. */
export type OrderIds = string[] | SQLWrapper;

/**
 * Removes the personal details from orders (FR-AUTH-06, NFR-LEGAL-14) in the
 * caller's transaction, from every version (ADR 0051). The orders and their
 * prices stay. Addresses are overwritten, not nulled, so the not-null columns
 * and the fulfilment constraint hold. The caller deletes supplied files after
 * the commit.
 */
export async function scrubOrders(tx: Writer, ids: OrderIds): Promise<void> {
  // Shaped like what they replace, so the order contract still reads a scrubbed
  // order back. `.invalid` is undeliverable (RFC 2606).
  const scrubbed = '[removed]';
  const scrubbedEmail = 'removed@deleted.invalid';
  const scrubbedPhone = '+00000000000';
  const revisions = tx
    .select({ id: orderRevisions.id })
    .from(orderRevisions)
    .where(inArray(orderRevisions.orderId, ids));

  // Customer-typed: "deliver to Anna, 0170…".
  await tx
    .update(orderItems)
    .set({ note: null })
    .where(inArray(orderItems.revisionId, revisions));

  await tx
    .update(orderRevisions)
    .set({
      contactName: scrubbed,
      contactEmail: scrubbedEmail,
      contactPhone: scrubbedPhone,
      // The invoiced party is personal data too: it is the customer or
      // somebody they named.
      partyName: scrubbed,
      partyRegistrationId: null,
      billingStreet: scrubbed,
      billingStreet2: null,
      billingPostalCode: scrubbed,
      billingCity: scrubbed,
      billingRegion: null,
      // Kept non-null where it was set, so the fulfilment constraint holds.
      deliveryStreet: sql`case when ${orderRevisions.deliveryStreet} is null then null else ${scrubbed} end`,
      deliveryStreet2: null,
      deliveryPostalCode: sql`case when ${orderRevisions.deliveryPostalCode} is null then null else ${scrubbed} end`,
      deliveryCity: sql`case when ${orderRevisions.deliveryCity} is null then null else ${scrubbed} end`,
      deliveryRegion: null,
      preferredDate: null,
      customerNote: null,
      // What a manager wrote about an adjustment: their words, but about
      // this customer's order, and quite capable of naming them.
      note: null,
      // Which list this customer was charged from — the same argument that
      // nulls `users.tierId`.
      tierKey: null,
    })
    .where(inArray(orderRevisions.orderId, ids));

  // `updatedAt` tells the outbound read the details went (FR-ADM-08,
  // NFR-LEGAL-07). The first removal's date is kept.
  const now = new Date();
  await tx
    .update(orders)
    .set({
      updatedAt: now,
      personalDataRemovedAt: sql`coalesce(${orders.personalDataRemovedAt}, ${now})`,
    })
    .where(inArray(orders.id, ids));
}
