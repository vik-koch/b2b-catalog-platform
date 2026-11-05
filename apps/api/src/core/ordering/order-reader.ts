import {
  ORDER_PAGE_SIZE,
  OrderDetail,
  OrderLine,
  OrderStatus,
  PaymentState,
  AdminOrderDetail,
  AdminOrderLine,
  StaffOrderSort,
} from '@b2b-catalog-platform/shared/core/ordering';
import { Pagination, TaxBasis } from '@b2b-catalog-platform/shared/platform';
import { ProductUnit } from '@b2b-catalog-platform/shared/core/catalog';
import { Inject, Injectable } from '@nestjs/common';
import { and, asc, count, eq, inArray, sql, SQL } from 'drizzle-orm';
import {
  orderColumns,
  customerRevision,
  acceptedTerms,
  notFound,
  orderListOrderBy,
  rowBillingAddress,
  OrderRow,
  OrderItemRow,
  CustomerThread,
} from './order-rows';
import { publiclyVisible } from '../catalog/product-view';
import { DRIZZLE } from '../../platform/db/database.module';
import { products } from '../catalog/catalog-schema';
import { users } from '../accounts/accounts-schema';
import { orderItems, orderRevisions, orders } from './ordering-schema';
import { OrderDocumentsService } from './order-documents.service';
import { Database } from '../../platform/db/database';

/**
 * Every read of an order (FR-ACC-01, FR-AUTH-03, ADR 0051): one projection for
 * every audience, so two screens cannot describe one order differently.
 */
@Injectable()
export class OrderReader {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly documents: OrderDocumentsService,
  ) {}

  /**
   * The shop's notes on every change since the customer was last told, oldest
   * first. Moves are left out: a move says what it is.
   */
  async changesSince(orderId: string, since: number): Promise<string[]> {
    return this.adjustmentNotes(
      orderId,
      sql`${orderRevisions.revisionNumber} > ${since}`,
    );
  }

  /** The shop's account of the changes to one order, oldest first, over
   * whichever stretch of the thread the caller is asking about. */
  private async adjustmentNotes(
    orderId: string,
    range: SQL,
  ): Promise<string[]> {
    const rows = await this.db
      .select({ note: orderRevisions.note })
      .from(orderRevisions)
      .where(
        and(
          eq(orderRevisions.orderId, orderId),
          eq(orderRevisions.kind, 'adjustment'),
          range,
        ),
      )
      .orderBy(asc(orderRevisions.revisionNumber));
    return rows.flatMap((row) => (row.note ? [row.note] : []));
  }

  /**
   * What the thread says the customer was told (FR-NOTIF-03): the newest
   * version mailed, the statuses announced, and the newest change. Derived from
   * the stamps, not kept as pointers that could disagree with them.
   */
  async customerThread(orderId: string): Promise<CustomerThread> {
    const rows = await this.db
      .select({
        number: orderRevisions.revisionNumber,
        status: orderRevisions.status,
        kind: orderRevisions.kind,
        notifiedAt: orderRevisions.notifiedAt,
      })
      .from(orderRevisions)
      .where(eq(orderRevisions.orderId, orderId));
    const told = rows.filter((row) => row.notifiedAt !== null);
    const highest = (of: typeof rows) =>
      of.reduce((found, row) => Math.max(found, row.number), 0);
    return {
      number: highest(told),
      statuses: [...new Set(told.map((row) => row.status as OrderStatus))],
      newestChange: highest(rows.filter((row) => row.kind === 'adjustment')),
    };
  }

  /** The customer's own view: the version they were last told about, which is
   * the current one on every order nobody has quietly changed. */
  async getForUser(userId: string, reference: string): Promise<OrderDetail> {
    const row = await this.row(
      and(eq(orders.reference, reference), eq(orders.userId, userId)),
      'customer',
    );
    return this.toDetail(row, undefined, await this.customerDocuments(row));
  }

  /** The mailed link's view (FR-NOTIF-06): the token is the only credential. */
  async getByToken(token: string): Promise<OrderDetail> {
    const row = await this.row(eq(orders.publicToken, token), 'customer');
    return this.toDetail(row, undefined, await this.customerDocuments(row));
  }

  async getForStaff(reference: string): Promise<AdminOrderDetail> {
    const row = await this.row(eq(orders.reference, reference));
    return this.staffDetail(
      row,
      undefined,
      await this.documents.listForStaff(
        row.id,
        row.reference,
        row.revisionNumber,
      ),
    );
  }

  /**
   * What a customer may open (FR-ORD-05), read against the version they are
   * shown: nothing filed against a later one, no payment slip on an order that
   * owes nothing.
   */
  customerDocuments(row: OrderRow) {
    return this.documents.listForCustomer(row.id, row.reference, {
      revisionNumber: row.revisionNumber,
      // The order's own, not the version's: what is owed is a fact about the
      // order today, whichever version is being looked at.
      paymentState: row.paymentState,
    });
  }

  /**
   * One order-and-version row as staff read it, current or superseded.
   * `notified` is passed by a caller rendering a whole thread, so it is read
   * once.
   */
  async staffDetail(
    row: OrderRow,
    notified?: CustomerThread,
    documents: AdminOrderDetail['documents'] = [],
  ): Promise<AdminOrderDetail> {
    const told = notified ?? (await this.customerThread(row.id));
    const items = await this.items(row.revisionId);
    const detail = await this.toDetail(row, items);
    const customerEmail = row.userId
      ? ((await this.emailsOf([row.userId])).get(row.userId) ?? null)
      : null;

    return {
      ...detail,
      // The customer's lines with their prices: one read, so they cannot
      // disagree.
      lines: detail.lines.map((line, index): AdminOrderLine => ({
        ...line,
        priceMinor: items[index].priceMinor,
      })),
      documents,
      customerEmail,
      // A guest's only way in; an account holder has a page of their own.
      publicToken: customerEmail === null ? row.publicToken : null,
      tierKey: row.tierKey,
      termsVersion: row.termsVersion,
      statusChangedAt: row.statusChangedAt.toISOString(),
      revisionNumber: row.revisionNumber,
      // Null only on an order mid-write, which nothing outside a transaction
      // can read: an order the customer has never been shown does not exist.
      customerRevisionNumber: row.customerRevisionNumber ?? row.revisionNumber,
      notifiedRevisionNumber: told.number,
      notifiedStatuses: told.statuses,
      paidAt: row.paidAt?.toISOString() ?? null,
      personalDataRemovedAt: row.personalDataRemovedAt?.toISOString() ?? null,
    };
  }

  async page(
    where: SQL | undefined,
    page: number,
    sort: StaffOrderSort = 'placed_desc',
    read: { as: 'staff' | 'customer' } = { as: 'staff' },
  ): Promise<{ rows: OrderRow[]; pagination: Pagination }> {
    // Counted through the same join and version the rows are read through: a
    // filter may name a snapshot column.
    const [{ total }] = await this.db
      .select({ total: count() })
      .from(orders)
      .innerJoin(
        orderRevisions,
        eq(
          read.as === 'staff'
            ? orders.currentRevisionId
            : orders.customerRevisionId,
          orderRevisions.id,
        ),
      )
      .where(where);
    const totalPages = Math.ceil(total / ORDER_PAGE_SIZE);
    const current = Math.max(1, page);
    const rows = await this.ordersAsSeen(read.as)
      .where(where)
      .orderBy(...orderListOrderBy(sort))
      .limit(ORDER_PAGE_SIZE)
      .offset((current - 1) * ORDER_PAGE_SIZE);

    return {
      rows,
      pagination: {
        page: current,
        pageSize: ORDER_PAGE_SIZE,
        total,
        totalPages,
      },
    };
  }

  /**
   * Every read of an order: the order joined to one version. Inner, so a broken
   * write fails loudly. Staff read the current version, a customer the one they
   * were last told about (FR-NOTIF-03).
   */
  private ordersAsSeen(by: 'staff' | 'customer' = 'staff') {
    const shown =
      by === 'staff' ? orders.currentRevisionId : orders.customerRevisionId;
    return this.db
      .select(orderColumns)
      .from(orders)
      .innerJoin(orderRevisions, eq(shown, orderRevisions.id))
      .leftJoin(
        customerRevision,
        eq(orders.customerRevisionId, customerRevision.id),
      )
      .leftJoin(acceptedTerms, eq(orders.termsVersionId, acceptedTerms.id));
  }

  async row(
    where: ReturnType<typeof and>,
    by: 'staff' | 'customer' = 'staff',
  ): Promise<OrderRow> {
    const [row] = await this.ordersAsSeen(by).where(where).limit(1);
    if (!row) throw notFound();
    return row;
  }

  async items(revisionId: string): Promise<OrderItemRow[]> {
    return this.db
      .select()
      .from(orderItems)
      .where(eq(orderItems.revisionId, revisionId))
      .orderBy(orderItems.sortOrder);
  }

  /** Keyed by revision: the lines hang off a version. */
  async itemCounts(ids: string[]): Promise<Map<string, number>> {
    if (ids.length === 0) return new Map();
    const rows = await this.db
      .select({ revisionId: orderItems.revisionId, items: count() })
      .from(orderItems)
      .where(inArray(orderItems.revisionId, ids))
      .groupBy(orderItems.revisionId);
    return new Map(rows.map((row) => [row.revisionId, Number(row.items)]));
  }

  /** Accounts by id, in one query — who placed each order in a list, and who
   * wrote each version of one. */
  async emailsOf(userIds: string[]): Promise<Map<string, string>> {
    const ids = [...new Set(userIds)];
    if (ids.length === 0) return new Map();
    const found = await this.db
      .select({ id: users.id, email: users.email })
      .from(users)
      .where(inArray(users.id, ids));
    return new Map(found.map((user) => [user.id, user.email]));
  }

  /**
   * `known` where the caller already read the items: the staff detail pairs its
   * prices to these lines by index.
   */
  async toDetail(
    row: OrderRow,
    known?: OrderItemRow[],
    /**
     * Passed in: customer and staff are shown different things about the files.
     */
    documents: OrderDetail['documents'] = [],
  ): Promise<OrderDetail> {
    const items = known ?? (await this.items(row.revisionId));
    // Linked by product id, and only where a customer may still open it: the
    // current slug, never a 404.
    const visible = await this.visibleProducts(
      items.map((item) => item.productId),
    );
    const lines = items.map((item): OrderLine => {
      const slug = visible.get(item.productId);
      return {
        name: item.name,
        // The snapshot only survives as the text of an unlinked line.
        slug: slug ?? item.slug,
        linked: slug !== undefined,
        image: item.thumbnail
          ? { full: item.thumbnail, thumb: item.thumbnail }
          : null,
        unit: item.unit as ProductUnit,
        quantity: item.quantity,
        pieces: item.pieces,
        lineTotalMinor: item.lineTotalMinor,
        taxRate: item.taxRate,
        note: item.note,
      };
    });

    return {
      reference: row.reference,
      status: row.status as OrderStatus,
      paymentState: row.paymentState as PaymentState,
      createdAt: row.createdAt.toISOString(),
      totalMinor: row.totalMinor,
      currency: row.currency,
      itemCount: items.length,
      contact: {
        name: row.contactName,
        email: row.contactEmail,
        phone: row.contactPhone,
      },
      party: {
        name: row.partyName,
        registrationId: row.partyRegistrationId,
      },
      fulfilmentMethod: row.fulfilmentMethod as OrderDetail['fulfilmentMethod'],
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
      deliveryZone: row.deliveryZoneKey
        ? {
            key: row.deliveryZoneKey,
            freeFromMinor: row.deliveryFreeFromMinor,
          }
        : null,
      billingAddress: rowBillingAddress(row),
      paymentMethod: row.paymentMethod as OrderDetail['paymentMethod'],
      preferredDate: row.preferredDate,
      customerNote: row.customerNote,
      statusReason: row.statusReason,
      termsDate: row.termsDate?.toISOString() ?? null,
      taxBasis: row.taxBasis as TaxBasis,
      // Up to this version: later changes were not part of what it said.
      changes: await this.adjustmentNotes(
        row.id,
        sql`${orderRevisions.revisionNumber} <= ${row.revisionNumber}`,
      ),
      lines,
      documents,
      shipment: {
        cartons: row.shipmentCartons,
        volume: row.shipmentVolume,
        weight: row.shipmentWeight,
        coveredLines: items.length - row.shipmentUncoveredLines,
        uncoveredLines: row.shipmentUncoveredLines,
        approximate: row.shipmentApproximate,
      },
    };
  }

  private async visibleProducts(ids: string[]): Promise<Map<string, string>> {
    if (ids.length === 0) return new Map();
    const rows = await this.db
      .select({ id: products.id, slug: products.slug })
      .from(products)
      .where(and(inArray(products.id, ids), publiclyVisible));
    return new Map(rows.map((row) => [row.id, row.slug]));
  }
}
