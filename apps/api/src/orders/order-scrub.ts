import { inArray, sql, SQLWrapper } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../db/schema';
import { orderItems, orderRevisions, orders } from '../db/schema';

type Writer = Pick<NodePgDatabase<typeof schema>, 'update' | 'select'>;

/** The orders to scrub: their ids, or a subquery selecting them. */
export type OrderIds = string[] | SQLWrapper;

/**
 * Removes the personal details from orders (FR-AUTH-06, NFR-LEGAL-14), in the
 * caller's transaction. The orders stay — the line prices are what the shop's
 * figures need — and every column that could name somebody goes.
 *
 * **Every version of every order** (ADR 0051), not only the one each order
 * currently shows: a superseded revision holds the same address and the same
 * name, and a removal that left it standing would be a removal in name only.
 *
 * The address columns are overwritten rather than nulled: several are
 * `not null`, and the fulfilment check constraint requires a delivery order
 * to keep a destination. A scrubbed order still reads as an order.
 *
 * A plain function, as `recordDestruction` is: account deletion, the
 * retention sweep and a guest's request all reach it, and none of them should
 * need the others' module to do so. The supplied documents are the caller's
 * to remove after the transaction, since files cannot be rolled back.
 */
export async function scrubOrders(tx: Writer, ids: OrderIds): Promise<void> {
  // Shaped like the thing it replaces, not merely labelled. `[removed]` in
  // the email column made every anonymized order unadjustable: the order
  // contract validates the address it reads back, and refused its own stored
  // data. `.invalid` is reserved and undeliverable (RFC 2606), and the phone
  // placeholder is a number nobody answers rather than a word in a number
  // column.
  const scrubbed = '[removed]';
  const scrubbedEmail = 'removed@deleted.invalid';
  const scrubbedPhone = '+00000000000';
  const revisions = tx
    .select({ id: orderRevisions.id })
    .from(orderRevisions)
    .where(inArray(orderRevisions.orderId, ids));

  // Customer-typed, and perfectly capable of naming someone: "deliver to
  // Anna, 0170…".
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

  // The scrubbing is a change to every one of those orders, and the one
  // reader that has to hear about it is the outbound read (FR-ADM-08,
  // NFR-LEGAL-07): a system that pulled the order last week holds the name
  // and address this just removed, and it learns they are gone by the order
  // coming round again with them blank. The first removal's date is kept: an
  // order swept last year and scrubbed again by an account deletion lost its
  // details last year.
  const now = new Date();
  await tx
    .update(orders)
    .set({
      updatedAt: now,
      personalDataRemovedAt: sql`coalesce(${orders.personalDataRemovedAt}, ${now})`,
    })
    .where(inArray(orders.id, ids));
}
