import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, eq, gte, inArray, sql } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import {
  FulfilmentMethod,
  ListMachineOrdersQuery,
  MachineOrder,
  MachineOrderLine,
  MachineOrdersPage,
  OrderStatus,
  PaymentMethod,
  PaymentState,
  ProductUnit,
} from '@b2b-catalog-platform/shared';
import { DRIZZLE } from '../db/database.module';
import * as schema from '../db/schema';
import { orderItems, orderRevisions, orders, users } from '../db/schema';
import { encodeMachineCursor, parseMachineCursor } from './machine-cursor';

/**
 * The outbound read of orders (FR-ADM-08).
 *
 * Its own service beside the customer read, under the same rule: it answers
 * whether or not anybody owns order processing, because the case it exists for
 * is the one before the hand-over — a system cannot be given orders to work
 * until it can see the orders that are here.
 *
 * It reads the order's **current version** and nothing else. The thread of
 * superseded versions is the shop's record of how an order got where it is
 * (FR-ORD-03); what is worked outside is where it is now, and naming that
 * version is what lets a write-back answer something rather than guess
 * (FR-ADM-08).
 *
 * Nothing here writes, and nothing here is refused by a setting: what gates it
 * is the token an admin issued with the `order-read` capability on it.
 */
@Injectable()
export class OrderReadService {
  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  /**
   * One page of orders, oldest change first.
   *
   * Ordered and paged on `orders.updatedAt` — when anything last happened to
   * the order — rather than on when it was placed, because the one call a
   * scheduled puller actually makes is "everything that has moved since I last
   * asked", and an order that was cancelled this morning was placed last week.
   * `id` breaks the tie: a cursor over a non-unique ordering either repeats
   * rows or loses them.
   */
  async listOrders(query: ListMachineOrdersQuery): Promise<MachineOrdersPage> {
    const after = parseMachineCursor(query.cursor);
    const rows = await orderRows(
      this.db,
      and(
        query.since ? gte(orders.updatedAt, new Date(query.since)) : undefined,
        // Row comparison rather than two clauses: it is the ordering written
        // down once, so the index that serves the sort serves the seek.
        after
          ? sql`(${orders.updatedAt}, ${orders.id}) > (${after.updatedAt}::timestamptz, ${after.id}::uuid)`
          : undefined,
      ),
      // One more than asked for, purely to find out whether there is a next
      // page. Cheaper than a count over a table being written to, and exact.
      query.limit + 1,
    );

    const page = rows.slice(0, query.limit);
    const lines = await this.linesOf(page.map((row) => row.revisionId));
    const last = page.at(-1);
    return {
      orders: page.map((row) => toRecord(row, lines.get(row.revisionId) ?? [])),
      nextCursor:
        rows.length > query.limit && last
          ? encodeMachineCursor(last.cursorAt, last.id)
          : null,
    };
  }

  /**
   * One order by the reference it is quoted by — the answer to "what does it
   * say now", which is the question a refused write-back leaves a client
   * holding.
   */
  async getOrder(reference: string): Promise<MachineOrder> {
    const [row] = await orderRows(this.db, eq(orders.reference, reference), 1);
    if (!row) {
      throw new NotFoundException({
        code: 'order-not-found',
        message: 'No order with that reference',
      });
    }
    const lines = await this.linesOf([row.revisionId]);
    return toRecord(row, lines.get(row.revisionId) ?? []);
  }

  /**
   * The lines of every version on the page, in one query rather than one per
   * order: a page is fifty orders, and fifty round trips to say what each of
   * them contains is the read's whole cost.
   */
  private async linesOf(
    revisionIds: string[],
  ): Promise<Map<string, MachineOrderLine[]>> {
    const byRevision = new Map<string, MachineOrderLine[]>();
    if (revisionIds.length === 0) return byRevision;

    const rows = await this.db
      .select({
        revisionId: orderItems.revisionId,
        productSourceId: orderItems.productSourceId,
        name: orderItems.name,
        unit: orderItems.unit,
        quantity: orderItems.quantity,
        pieces: orderItems.pieces,
        priceMinor: orderItems.priceMinor,
        lineTotalMinor: orderItems.lineTotalMinor,
        note: orderItems.note,
      })
      .from(orderItems)
      .where(inArray(orderItems.revisionId, revisionIds))
      // The order the customer wrote them in, which is the order every other
      // reading of the order uses.
      .orderBy(asc(orderItems.revisionId), asc(orderItems.sortOrder));

    for (const row of rows) {
      const lines = byRevision.get(row.revisionId) ?? [];
      lines.push({
        productSourceId: row.productSourceId,
        name: row.name,
        unit: row.unit as ProductUnit,
        quantity: row.quantity,
        pieces: row.pieces,
        priceMinor: row.priceMinor,
        lineTotalMinor: row.lineTotalMinor,
        note: row.note,
      });
      byRevision.set(row.revisionId, lines);
    }
    return byRevision;
  }
}

/**
 * The order joined to the version it stands on, and to the account it was
 * placed from where there is one.
 *
 * An inner join on the revision: the pointer is nullable only because the
 * order row is written a statement before its first version, inside one
 * transaction, so an order without one cannot be read by anybody.
 */
function orderRows(
  db: NodePgDatabase<typeof schema>,
  where: ReturnType<typeof and>,
  limit: number,
) {
  return db
    .select({
      id: orders.id,
      reference: orders.reference,
      status: orders.status,
      paymentState: orders.paymentState,
      statusChangedAt: orders.statusChangedAt,
      paidAt: orders.paidAt,
      createdAt: orders.createdAt,
      updatedAt: orders.updatedAt,
      // The same instant as `updatedAt`, at the precision Postgres actually
      // stores it — see `machine-cursor` for why the cursor may not be built
      // from the field the client reads.
      cursorAt: sql<string>`${orders.updatedAt}::text`,
      accountId: users.id,
      accountSourceId: users.sourceId,
      revisionId: orderRevisions.id,
      revisionNumber: orderRevisions.revisionNumber,
      note: orderRevisions.note,
      statusReason: orderRevisions.statusReason,
      contactName: orderRevisions.contactName,
      contactEmail: orderRevisions.contactEmail,
      contactPhone: orderRevisions.contactPhone,
      partyName: orderRevisions.partyName,
      partyRegistrationId: orderRevisions.partyRegistrationId,
      paymentMethod: orderRevisions.paymentMethod,
      fulfilmentMethod: orderRevisions.fulfilmentMethod,
      billingStreet: orderRevisions.billingStreet,
      billingStreet2: orderRevisions.billingStreet2,
      billingPostalCode: orderRevisions.billingPostalCode,
      billingCity: orderRevisions.billingCity,
      billingRegion: orderRevisions.billingRegion,
      billingCountry: orderRevisions.billingCountry,
      deliveryStreet: orderRevisions.deliveryStreet,
      deliveryStreet2: orderRevisions.deliveryStreet2,
      deliveryPostalCode: orderRevisions.deliveryPostalCode,
      deliveryCity: orderRevisions.deliveryCity,
      deliveryRegion: orderRevisions.deliveryRegion,
      deliveryCountry: orderRevisions.deliveryCountry,
      pickupLocationKey: orderRevisions.pickupLocationKey,
      pickupLocationName: orderRevisions.pickupLocationName,
      pickupLocationAddress: orderRevisions.pickupLocationAddress,
      preferredDate: orderRevisions.preferredDate,
      customerNote: orderRevisions.customerNote,
      totalMinor: orderRevisions.totalMinor,
      currency: orderRevisions.currency,
      tierKey: orderRevisions.tierKey,
    })
    .from(orders)
    .innerJoin(orderRevisions, eq(orderRevisions.id, orders.currentRevisionId))
    .leftJoin(users, eq(users.id, orders.userId))
    .where(where)
    .orderBy(asc(orders.updatedAt), asc(orders.id))
    .limit(limit);
}

type OrderRow = Awaited<ReturnType<typeof orderRows>>[number];

/**
 * One order as the outside is owed it.
 *
 * The counterparty is named by the account's keys and not by the contact the
 * checkout carried (FR-ADM-14): the same person may order under a colleague's
 * phone number and have it invoiced to a company they named, and none of that
 * says which customer record it is. A guest order has no account and says so.
 */
function toRecord(row: OrderRow, lines: MachineOrderLine[]): MachineOrder {
  return {
    reference: row.reference,
    status: row.status as OrderStatus,
    paymentState: row.paymentState as PaymentState,
    revisionNumber: row.revisionNumber,
    customer: row.accountId
      ? { accountId: row.accountId, sourceId: row.accountSourceId }
      : null,
    contact: {
      name: row.contactName,
      email: row.contactEmail,
      phone: row.contactPhone,
    },
    party: { name: row.partyName, registrationId: row.partyRegistrationId },
    fulfilmentMethod: row.fulfilmentMethod as FulfilmentMethod,
    paymentMethod: row.paymentMethod as PaymentMethod,
    deliveryAddress: row.deliveryStreet
      ? {
          street: row.deliveryStreet,
          street2: row.deliveryStreet2,
          postalCode: row.deliveryPostalCode ?? '',
          city: row.deliveryCity ?? '',
          region: row.deliveryRegion,
          country: row.deliveryCountry ?? '',
        }
      : null,
    pickup: row.pickupLocationKey
      ? {
          key: row.pickupLocationKey,
          name: row.pickupLocationName ?? row.pickupLocationKey,
          address: row.pickupLocationAddress ?? '',
        }
      : null,
    billingAddress: row.billingStreet
      ? {
          street: row.billingStreet,
          street2: row.billingStreet2,
          postalCode: row.billingPostalCode ?? '',
          city: row.billingCity ?? '',
          region: row.billingRegion,
          country: row.billingCountry ?? '',
        }
      : null,
    preferredDate: row.preferredDate,
    customerNote: row.customerNote,
    statusReason: row.statusReason,
    note: row.note,
    tierKey: row.tierKey,
    lines,
    totalMinor: row.totalMinor,
    currency: row.currency,
    createdAt: row.createdAt.toISOString(),
    statusChangedAt: row.statusChangedAt.toISOString(),
    paidAt: row.paidAt?.toISOString() ?? null,
    updatedAt: row.updatedAt.toISOString(),
  };
}
