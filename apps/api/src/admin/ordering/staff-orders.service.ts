import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, ilike, inArray, ne, or, SQL } from 'drizzle-orm';

import { AddressInput } from '@b2b-catalog-platform/shared/core/accounts';
import { TaxBasis } from '@b2b-catalog-platform/shared/core/catalog';
import {
  ACCEPTED_ORDER_STATUSES,
  AdminOrderDetail,
  moveDirection,
  OrderAdjustment,
  OrderAdjustmentPreview,
  OrderRevision,
  OrderRevisionEntry,
  OrderRevisionKind,
  OrderStatus,
  OrderSummary,
  OrderTransition,
  PaymentMethod,
  PaymentState,
  paymentStateAfterAdjustment,
  StaffOrderSort,
  StaffPaymentFilter,
} from '@b2b-catalog-platform/shared/core/ordering';
import {
  alternateLayoutQuery,
  KeyboardLayout,
  Pagination,
} from '@b2b-catalog-platform/shared/platform';

import { users } from '../../core/accounts/accounts-schema';
import {
  priceAdjustment,
  PricedAdjustment,
} from '../../core/ordering/order-adjustment';
import { OrderDocumentsService } from '../../core/ordering/order-documents.service';
import { OrderReader } from '../../core/ordering/order-reader';
import {
  acceptedTerms,
  adjustedItems,
  customerRevision,
  CustomerThread,
  detailColumns,
  Fulfilment,
  notFound,
  orderColumns,
  orderMovedOn,
  OrderRow,
  OrderSnapshot,
  refuseIfDetailsRemoved,
  shipmentColumns,
  toSummary,
} from '../../core/ordering/order-rows';
import { OrderRules } from '../../core/ordering/order-rules';
import { OrderWriter } from '../../core/ordering/order-writer';
import { orderRevisions, orders } from '../../core/ordering/ordering-schema';
import { ALTERNATE_LAYOUT } from '../../platform/config/deployment-config';
import { Database } from '../../platform/db/database';
import { DRIZZLE } from '../../platform/db/database.module';

/** Staff answering orders (FR-AUTH-03, FR-ORD-02/03/04, FR-NOTIF-03). */
@Injectable()
export class StaffOrdersService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly reads: OrderReader,
    private readonly writer: OrderWriter,
    private readonly rules: OrderRules,
    private readonly documents: OrderDocumentsService,
    @Inject(ALTERNATE_LAYOUT)
    private readonly alternateLayout: KeyboardLayout | null,
  ) {}

  /**
   * Brings the customer's page up to the current version and, if asked, mails
   * them (FR-NOTIF-03). Refused only when there is nothing left to do.
   */
  async showCustomerCurrent(
    reference: string,
    notify: boolean,
  ): Promise<AdminOrderDetail> {
    const current = await this.reads.row(eq(orders.reference, reference));
    refuseIfDetailsRemoved(current);
    const notified = await this.reads.customerThread(current.id);
    const shown = current.customerRevisionNumber ?? current.revisionNumber;
    const behind = shown < current.revisionNumber;
    // A mail lost to spam must be resendable; a press that does nothing is not.
    if (!behind && !notify) {
      throw new ConflictException({
        code: 'nothing-to-tell',
        message: 'The customer is already on this version',
      });
    }

    if (behind) {
      await this.db
        .update(orders)
        .set({ customerRevisionId: current.revisionId, updatedAt: new Date() })
        .where(eq(orders.id, current.id));
    }
    if (notify) {
      // Stamped before the send: the thread records what the shop sent.
      await this.db
        .update(orderRevisions)
        .set({ notifiedAt: new Date() })
        .where(eq(orderRevisions.id, current.revisionId));
      await this.writer.mailCustomer(
        reference,
        notified.number,
        // Worded by what the newest version was written for.
        current.revisionKind === 'adjustment' ? 'changed' : 'moved',
      );
    }
    return this.reads.getForStaff(reference);
  }

  async listAll(
    page = 1,
    status?: OrderStatus,
    q?: string,
    sort: StaffOrderSort = 'status',
    payment?: StaffPaymentFilter,
  ): Promise<{
    items: (OrderSummary & {
      customerEmail: string | null;
      contactName: string;
      paymentMethod: PaymentMethod;
      revisionNumber: number;
    })[];
    pagination: Pagination;
  }> {
    const conditions: SQL[] = [];
    if (status) conditions.push(eq(orders.status, status));
    const owed = this.paymentCondition(payment);
    if (owed) conditions.push(owed);
    const search = this.searchCondition(q);
    if (search) conditions.push(search);
    const where = conditions.length ? and(...conditions) : undefined;
    const { rows, pagination } = await this.reads.page(where, page, sort);
    const counts = await this.reads.itemCounts(
      rows.map((row) => row.revisionId),
    );
    const emails = await this.customerEmails(rows);

    return {
      items: rows.map((row) => ({
        ...toSummary(row, counts.get(row.revisionId) ?? 0),
        customerEmail: row.userId ? (emails.get(row.userId) ?? null) : null,
        contactName: row.contactName,
        paymentMethod: row.paymentMethod as PaymentMethod,
        revisionNumber: row.revisionNumber,
      })),
      pagination,
    };
  }

  /**
   * Every version, newest first (FR-ORD-03), through the current order's own
   * projection. The order is read first, so an unknown reference is a 404.
   */
  async getRevisions(reference: string): Promise<OrderRevisionEntry[]> {
    // The order first, so an unknown reference is a 404, not an empty list.
    const current = await this.reads.row(eq(orders.reference, reference));
    const rows = await this.revisionRows(current.id);
    const notified = await this.reads.customerThread(current.id);
    const authors = await this.reads.emailsOf(
      rows.flatMap((row) =>
        row.revisionCreatedBy ? [row.revisionCreatedBy] : [],
      ),
    );
    return Promise.all(
      rows.map(async (row) => {
        // The timeline reads no documents.
        const { documents: _documents, ...entry } = await this.toRevision(
          row,
          current,
          authors,
          notified,
        );
        return entry;
      }),
    );
  }

  /** One version on its own (FR-ORD-03), so rendering one costs one. */
  async getRevision(reference: string, number: number): Promise<OrderRevision> {
    const current = await this.reads.row(eq(orders.reference, reference));
    const [row] = await this.revisionRows(current.id, number);
    // A version this order never had is the same answer as an order nobody
    // has: there is nothing at that address.
    if (!row) throw notFound();
    const authors = await this.reads.emailsOf(
      row.revisionCreatedBy ? [row.revisionCreatedBy] : [],
    );
    return this.toRevision(
      row,
      current,
      authors,
      await this.reads.customerThread(current.id),
      await this.documents.listForStaff(
        row.id,
        row.reference,
        row.revisionNumber,
      ),
    );
  }

  /** The order joined to its versions, not to the current one: every version,
   * or the one asked for. */
  private revisionRows(orderId: string, number?: number): Promise<OrderRow[]> {
    return this.db
      .select(orderColumns)
      .from(orders)
      .innerJoin(orderRevisions, eq(orderRevisions.orderId, orders.id))
      .leftJoin(
        customerRevision,
        eq(orders.customerRevisionId, customerRevision.id),
      )
      .leftJoin(acceptedTerms, eq(orders.termsVersionId, acceptedTerms.id))
      .where(
        number === undefined
          ? eq(orders.id, orderId)
          : and(
              eq(orders.id, orderId),
              eq(orderRevisions.revisionNumber, number),
            ),
      )
      .orderBy(desc(orderRevisions.revisionNumber));
  }

  /** One version as staff read it: the whole snapshot, plus the four facts
   * that are about the version rather than about the order. */
  private async toRevision(
    row: OrderRow,
    current: OrderRow,
    authors: Map<string, string>,
    notified: CustomerThread,
    // The order's files, each marked `outdated` against this version; the
    // thread does not ask for them.
    documents: AdminOrderDetail['documents'] = [],
  ): Promise<OrderRevision> {
    const detail = await this.reads.staffDetail(row, notified, documents);
    return {
      ...detail,
      revisionCreatedAt: row.revisionCreatedAt.toISOString(),
      author: row.revisionCreatedBy
        ? (authors.get(row.revisionCreatedBy) ?? null)
        : null,
      // An exchange's own name for whoever acted, never resolved to an account.
      source: row.source,
      kind: row.revisionKind as OrderRevisionKind,
      note: row.revisionNote,
      customerView: row.customerRevisionNumber === row.revisionNumber,
      notifiedAt: row.revisionNotifiedAt?.toISOString() ?? null,
      // Facts about the order, read against its current version.
      revisionNumber: row.revisionNumber,
      customerRevisionNumber:
        current.customerRevisionNumber ?? current.revisionNumber,
    };
  }

  /**
   * Staff moving an order. The mail is sent here: whether there is one to send
   * is known only after the write.
   */
  async transitionForStaff(
    reference: string,
    move: OrderTransition,
    byUserId: string,
  ): Promise<AdminOrderDetail> {
    const before = await this.reads.row(eq(orders.reference, reference));
    // Before the write: the version they were last told about starts the mail.
    const notified = await this.reads.customerThread(before.id);
    await this.writer.move(
      eq(orders.reference, reference),
      'staff',
      move.to,
      move.reason,
      byUserId,
      {
        notify: move.notify,
        markPaid: move.markPaid,
        showCustomer: move.showCustomer,
      },
    );
    if (move.notify) {
      await this.writer.mailCustomer(
        reference,
        notified.number,
        // An undo is worded as a correction, not a step forward.
        moveDirection(before.status as OrderStatus, move.to) === 'backward'
          ? 'corrected'
          : 'moved',
      );
    }
    return this.reads.getForStaff(reference);
  }

  /**
   * What an adjustment would come to (FR-ORD-03): the write's own arithmetic,
   * answered as the proposed order rather than a diff.
   */
  async previewAdjustment(
    reference: string,
    input: OrderAdjustment,
  ): Promise<OrderAdjustmentPreview> {
    const current = await this.reads.row(eq(orders.reference, reference));
    const { priced, fulfilment } = await this.priceAdjusted(input, current);

    return {
      lines: priced.lines.map((line) => ({
        name: line.name,
        slug: line.slug,
        // Staff open every line, whatever the storefront shows; the flags say
        // the product's state.
        linked: true,
        image: line.thumbnail
          ? { full: line.thumbnail, thumb: line.thumbnail }
          : null,
        unit: line.unit,
        quantity: line.quantity,
        pieces: line.pieces,
        priceMinor: line.priceMinor,
        lineTotalMinor: line.lineTotalMinor,
        taxRate: line.taxRate,
        note: line.note,
        flags: line.flags,
        listPriceMinor: line.listPriceMinor,
      })),
      totalMinor: priced.totalMinor,
      // The order's own currency, not today's config: an old order is priced
      // in what it was priced in, and an adjustment does not re-denominate it.
      currency: current.currency,
      taxBasis: current.taxBasis as TaxBasis,
      deliveryZone: fulfilment.zone,
      shipment: {
        cartons: priced.shipment.cartons,
        volume: priced.shipment.volume,
        weight: priced.shipment.weight,
        coveredLines: priced.lines.length - priced.shipment.uncoveredLines,
        uncoveredLines: priced.shipment.uncoveredLines,
        approximate: priced.shipment.approximate,
      },
    };
  }

  /**
   * Changes what an order says: a new version (FR-ORD-03) that moves
   * nothing and mails no one unless asked. Guarded by the version it was
   * written against; the customer's own words are carried across.
   */
  async adjust(
    reference: string,
    input: OrderAdjustment,
    byUserId: string,
  ): Promise<AdminOrderDetail> {
    const current = await this.reads.row(eq(orders.reference, reference));
    refuseIfDetailsRemoved(current);
    if (current.revisionNumber !== input.basedOnRevision) {
      throw orderMovedOn();
    }

    const notified = await this.reads.customerThread(current.id);
    const { priced, fulfilment, billing } = await this.priceAdjusted(
      input,
      current,
    );
    const status = current.status as OrderStatus;
    const snapshot = this.adjustedSnapshot(current, input, priced, {
      billing,
      fulfilment,
    });
    const lines = adjustedItems(priced);
    if (await this.writer.saysTheSame(current, snapshot, lines)) {
      throw new ConflictException({
        code: 'no-change',
        message: 'This changes nothing the order says',
      });
    }

    await this.writer.appendRevision(current, {
      kind: 'adjustment',
      status,
      statusReason: current.statusReason,
      note: input.note,
      byUserId,
      snapshot,
      lines,
      paymentState: paymentStateAfterAdjustment(
        current.paymentState as PaymentState,
        status,
        input.paymentMethod,
      ),
      movedAt: null,
      // An untold change is not theirs to see: their page and the mail that
      // announced it must agree.
      showCustomer: input.notify,
      notified: input.notify,
      paid: null,
    });

    if (input.notify) {
      await this.writer.mailCustomer(reference, notified.number, 'changed');
    }
    return this.reads.getForStaff(reference);
  }

  /**
   * The order as the adjustment proposes it; the customer's own words carried.
   */
  private adjustedSnapshot(
    current: OrderRow,
    input: OrderAdjustment,
    priced: PricedAdjustment,
    resolved: { billing: AddressInput | null; fulfilment: Fulfilment },
  ): OrderSnapshot {
    return {
      ...detailColumns(input, resolved.billing, resolved.fulfilment),
      // The customer's own, carried across: an adjustment is the shop's half
      // of the record and never rewrites theirs.
      preferredDate: current.preferredDate,
      customerNote: current.customerNote,
      totalMinor: priced.totalMinor,
      // The order's own currency, not today's config: an old order is priced
      // in what it was priced in, and an adjustment does not re-denominate it.
      currency: current.currency,
      tierKey: input.tierKey,
      ...shipmentColumns(priced.shipment),
    };
  }

  /** Everything both the preview and the write need worked out, in the order
   * the checkout works it out in. */
  private async priceAdjusted(
    input: OrderAdjustment,
    current: OrderRow,
  ): Promise<{
    priced: PricedAdjustment;
    fulfilment: Fulfilment;
    billing: AddressInput | null;
  }> {
    const priced = await priceAdjustment(
      this.db,
      input.lines,
      await this.writer.tierId(input.tierKey),
      this.writer.lineTaxRate(current),
    );
    this.rules.assertAddresses(input);
    this.rules.assertParty(input.party, input.paymentMethod);
    return {
      priced,
      fulfilment: this.rules.resolveFulfilment(input),
      billing: this.rules.adjustedBilling(input, current),
    };
  }

  /**
   * The payment filter, by what the badge shows. `cash`: an accepted cash order
   * with no handover recorded. `unpaid`: anything not recorded as paid.
   */
  private paymentCondition(filter?: StaffPaymentFilter): SQL | undefined {
    if (!filter) return undefined;
    if (filter === 'unpaid') return ne(orders.paymentState, 'paid');
    if (filter === 'cash') {
      return and(
        eq(orderRevisions.paymentMethod, 'cash'),
        eq(orders.paymentState, 'not-due'),
        inArray(orders.status, [
          ...ACCEPTED_ORDER_STATUSES,
          'ready',
          'completed',
        ]),
      );
    }
    return eq(orders.paymentState, filter);
  }

  /**
   * Find-an-order (FR-AUTH-03): a fragment of the reference, contact name or
   * email, party, or the account's email.
   */
  private searchCondition(q: string | undefined): SQL | undefined {
    const term = q?.trim();
    if (!term) return undefined;
    const mapped = alternateLayoutQuery(term, this.alternateLayout);
    return or(
      ...[term, ...(mapped === null ? [] : [mapped])].flatMap((text) => {
        const like = `%${text}%`;
        return [
          ilike(orders.reference, like),
          ilike(orderRevisions.contactName, like),
          ilike(orderRevisions.contactEmail, like),
          ilike(orderRevisions.partyName, like),
          inArray(
            orders.userId,
            this.db
              .select({ id: users.id })
              .from(users)
              .where(ilike(users.email, like)),
          ),
        ];
      }),
    );
  }

  private customerEmails(rows: OrderRow[]): Promise<Map<string, string>> {
    return this.reads.emailsOf(
      rows.flatMap((row) => (row.userId ? [row.userId] : [])),
    );
  }
}
