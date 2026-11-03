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
import { TaxBasis } from '@b2b-catalog-platform/shared';
import { Pagination } from '@b2b-catalog-platform/shared/platform';
import { ProductUnit } from '@b2b-catalog-platform/shared/core/catalog';
import { Inject, Injectable } from '@nestjs/common';
import { and, asc, count, eq, inArray, sql, SQL } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
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
import { DRIZZLE } from '../../db/database.module';
import {
  orderItems,
  orderRevisions,
  orders,
  products,
  users,
} from '../../db/schema';
import { OrderDocumentsService } from './order-documents.service';
import * as schema from '../../db/schema';

/**
 * Every read of an order (FR-ACC-01, FR-AUTH-03, ADR 0051): one projection for
 * every audience, so two screens cannot describe one order differently.
 */
@Injectable()
export class OrderReader {
  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof schema>,
    private readonly documents: OrderDocumentsService,
  ) {}

  /**
   * What the shop said about every change written since the customer was last
   * told — their words, newest last, so the mail reads as the account of one
   * conversation.
   *
   * Only adjustments: a move says what it is by being a move, and quoting a
   * reason twice is the same sentence in two places.
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
   * Which versions of an order have actually put something in the customer's
   * inbox (FR-NOTIF-03) — the newest of them, which states they announced —
   * and whether a change of the shop's is sitting above the version they are
   * shown, waiting for somebody to mention it.
   *
   * Derived from the thread rather than kept as pointers of its own. There is
   * already one pointer on the order — what the customer is looking at — and
   * another saying what they were told would be a fact stored twice, free to
   * disagree with the stamps that produced it.
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

  /** The mailed link's view (FR-NOTIF-06). The token is the only credential,
   * so it is matched on its own — no session is consulted. It shows what the
   * mail that carried it described. */
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
   * What a customer may open on their own order (FR-ORD-05).
   *
   * Read against the row as *they* see it — the projection has already
   * resolved which version that is — so a document filed against a version
   * they have not been shown, or a payment slip on an order that owes
   * nothing, is not on the list.
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
   * One order-and-version row as staff read it — used for the version an
   * order currently shows and for every version it has had.
   *
   * `notified` is the thread's answer to "what have we actually told them",
   * asked once by a caller rendering a whole thread and asked here for
   * everyone else: it is a fact about the order, and reading it per version
   * would be the same query as many times as the order has been touched.
   */
  async staffDetail(
    row: OrderRow,
    notified?: CustomerThread,
    documents: AdminOrderDetail['documents'] = [],
  ): Promise<AdminOrderDetail> {
    const told = notified ?? (await this.customerThread(row.id));
    const items = await this.items(row.revisionId);
    const detail = await this.toDetail(row, items);
    const [customer] = row.userId
      ? await this.db
          .select({ email: users.email })
          .from(users)
          .where(eq(users.id, row.userId))
          .limit(1)
      : [];

    return {
      ...detail,
      // Built from the customer's own lines — from the very same rows, so the
      // two views cannot describe the same order differently and the index
      // pairing below cannot slip. Staff simply see more of each line.
      lines: detail.lines.map((line, index): AdminOrderLine => ({
        ...line,
        priceMinor: items[index].priceMinor,
      })),
      documents,
      customerEmail: customer?.email ?? null,
      // Only where it is the customer's only way in. An account holder reads
      // their order signed in, and handing staff a capability URL for a page
      // they can already reach another way would be minting a second one.
      publicToken: customer ? null : row.publicToken,
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
    // Counted through the same join the rows are read through — the same
    // version, too: a filter may name a snapshot column, and a count that
    // cannot see the revision would page a different set from the one it is
    // counting.
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
   * Every read of an order goes through here: the order joined to one of its
   * versions. An inner join rather than a left one — an order with no current
   * revision is not an order that reads oddly, it is a broken write, and hiding
   * it behind nulls would spread the breakage into every screen.
   *
   * Which version depends on who is reading. Staff read the order as it now
   * stands; a customer reads the one they were last written to about
   * (FR-NOTIF-03), which is the same one until the shop changes something
   * without telling them, or reopens an order they have already been told was
   * finished.
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

  /** Keyed by revision, since that is what the lines hang off: two versions of
   * one order have their own line counts, and only the current one is asked
   * about here. */
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

  /** `items` where the caller has already read them — `getForStaff` needs the
   * same rows for the basis figures, and it pairs them to these lines by
   * index, which two separate reads of one order have no business deciding. */
  async toDetail(
    row: OrderRow,
    known?: OrderItemRow[],
    /** What the reader may open (FR-ORD-05). Passed in rather than read here:
     * a customer and staff are shown different things about the same files,
     * and a version of an order carries none at all. */
    documents: OrderDetail['documents'] = [],
  ): Promise<OrderDetail> {
    const items = known ?? (await this.items(row.revisionId));
    // Resolved by product id, never by the slug snapshot — and only where the
    // product is still something a customer may open, so an order never sends
    // anyone into a 404. The *current* slug is what a linked line carries: a
    // product renamed since the order was placed moved, and the snapshot would
    // point at where it used to be.
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
      // Every change the shop has made up to the version being read, and not
      // one word more: a version is a reading of the order at one moment, and
      // changes made after it were not part of what this version said.
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
