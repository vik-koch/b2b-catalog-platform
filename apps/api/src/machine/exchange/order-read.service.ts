import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, eq, gte, inArray, sql } from 'drizzle-orm';
import {
  FulfilmentMethod,
  OrderStatus,
  PaymentMethod,
  PaymentState,
} from '@b2b-catalog-platform/shared/core/ordering';
import {
  ProductUnit,
  TaxBasis,
} from '@b2b-catalog-platform/shared/core/catalog';
import {
  ListMachineOrdersQuery,
  MachineOrder,
  MachineOrderLine,
  MachineOrdersPage,
} from '@b2b-catalog-platform/shared/machine/exchange';
import { DRIZZLE } from '../../platform/db/database.module';
import { users } from '../../core/accounts/accounts-schema';
import {
  orderItems,
  orderRevisions,
  orders,
} from '../../core/ordering/ordering-schema';
import { encodeMachineCursor, parseMachineCursor } from './machine-cursor';
import { cancelledByCustomer } from './order-write-back';
import { Database } from '../../platform/db/database';

/**
 * The outbound read of orders (FR-ADM-08): the current version only, whose
 * number a write-back names to answer it rather than guess. The superseded
 * versions are the shop's own record.
 */
@Injectable()
export class OrderReadService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /**
   * One page, oldest change first: by `updatedAt`, not placement, since a
   * puller asks what moved since it last asked. `id` breaks the tie, or a
   * cursor repeats or loses rows.
   */
  async listOrders(query: ListMachineOrdersQuery): Promise<MachineOrdersPage> {
    const after = parseMachineCursor(query.cursor);
    const rows = await orderRows(
      this.db,
      and(
        query.since ? gte(orders.updatedAt, new Date(query.since)) : undefined,
        // One row comparison, so the index that serves the sort serves the seek.
        after
          ? sql`(${orders.updatedAt}, ${orders.id}) > (${after.updatedAt}::timestamptz, ${after.id}::uuid)`
          : undefined,
      ),
      // One more than asked for says whether there is a next page.
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

  /** What an order says now: the question a refused write-back leaves. */
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

  /** The lines of every version on the page, in one query. */
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
        taxRate: orderItems.taxRate,
        note: orderItems.note,
      })
      .from(orderItems)
      .where(inArray(orderItems.revisionId, revisionIds))
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
        taxRate: row.taxRate,
        note: row.note,
      });
      byRevision.set(row.revisionId, lines);
    }
    return byRevision;
  }
}

/**
 * The order on its current version, and its account where there is one. An
 * inner join: the pointer is null only inside the transaction that writes the
 * first version.
 */
function orderRows(db: Database, where: ReturnType<typeof and>, limit: number) {
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
      // `updatedAt` at full precision for the cursor; see `machine-cursor`.
      cursorAt: sql<string>`${orders.updatedAt}::text`,
      accountId: users.id,
      accountSourceId: users.sourceId,
      revisionId: orderRevisions.id,
      revisionNumber: orderRevisions.revisionNumber,
      // For a cancelled order, who wrote the version that cancelled it.
      revisionCreatedBy: orderRevisions.createdBy,
      userId: orders.userId,
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
      taxBasis: orders.taxBasis,
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
 * One order as the outside is owed it. The customer is the account's keys,
 * not the checkout's contact, which says nothing about which record it is
 * (FR-ADM-14); a guest order has none.
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
    deliveryAddress: address(
      row.deliveryStreet,
      row.deliveryStreet2,
      row.deliveryPostalCode,
      row.deliveryCity,
      row.deliveryRegion,
      row.deliveryCountry,
    ),
    pickup: row.pickupLocationKey
      ? {
          key: row.pickupLocationKey,
          name: row.pickupLocationName ?? row.pickupLocationKey,
          address: row.pickupLocationAddress ?? '',
        }
      : null,
    billingAddress: address(
      row.billingStreet,
      row.billingStreet2,
      row.billingPostalCode,
      row.billingCity,
      row.billingRegion,
      row.billingCountry,
    ),
    preferredDate: row.preferredDate,
    customerNote: row.customerNote,
    statusReason: row.statusReason,
    // The one fact a write-back turns on that a reader cannot derive.
    cancelledBy:
      row.status !== 'cancelled'
        ? null
        : cancelledByCustomer(row)
          ? 'customer'
          : 'shop',
    note: row.note,
    tierKey: row.tierKey,
    lines,
    totalMinor: row.totalMinor,
    currency: row.currency,
    taxBasis: row.taxBasis as TaxBasis,
    createdAt: row.createdAt.toISOString(),
    statusChangedAt: row.statusChangedAt.toISOString(),
    paidAt: row.paidAt?.toISOString() ?? null,
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** An address snapshot, or null where the order carries none. */
function address(
  street: string | null,
  street2: string | null,
  postalCode: string | null,
  city: string | null,
  region: string | null,
  country: string | null,
): MachineOrder['deliveryAddress'] {
  if (!street) return null;
  return {
    street,
    street2,
    postalCode: postalCode ?? '',
    city: city ?? '',
    region,
    country: country ?? '',
  };
}
