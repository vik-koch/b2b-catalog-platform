import {
  ACCEPTED_ORDER_STATUSES,
  moveDirection,
  OrderStatus,
  OrderSummary,
  PaymentMethod,
  PaymentState,
  paymentStateAfterAdjustment,
  AdminOrderDetail,
  OrderAdjustment,
  OrderAdjustmentPreview,
  OrderRevision,
  OrderRevisionEntry,
  OrderRevisionKind,
  OrderTransition,
  StaffOrderSort,
  StaffPaymentFilter,
} from '@b2b-catalog-platform/shared/core/ordering';
import { TaxBasis } from '@b2b-catalog-platform/shared';
import {
  Pagination,
  alternateLayoutQuery,
  KeyboardLayout,
} from '@b2b-catalog-platform/shared/platform';
import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, ilike, inArray, ne, or, SQL } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { AddressInput } from '@b2b-catalog-platform/shared/core/accounts';
import {
  orderColumns,
  customerRevision,
  acceptedTerms,
  notFound,
  orderMovedOn,
  refuseIfDetailsRemoved,
  toSummary,
  OrderRow,
  OrderSnapshot,
  CustomerThread,
  Fulfilment,
} from '../../core/ordering/order-rows';
import { OrderReader } from '../../core/ordering/order-reader';
import { OrderWriter } from '../../core/ordering/order-writer';
import { OrderRules } from '../../core/ordering/order-rules';
import { ALTERNATE_LAYOUT } from '../../config/deployment-config';
import { DRIZZLE } from '../../db/database.module';
import { orderRevisions, orders, users } from '../../db/schema';
import {
  priceAdjustment,
  PricedAdjustment,
} from '../../core/ordering/order-adjustment';
import { OrderDocumentsService } from '../../core/ordering/order-documents.service';
import * as schema from '../../db/schema';

/** Staff answering orders (FR-AUTH-03, FR-ORD-02/03/04, FR-NOTIF-03). */
@Injectable()
export class StaffOrdersService {
  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof schema>,
    private readonly reads: OrderReader,
    private readonly writer: OrderWriter,
    private readonly rules: OrderRules,
    private readonly documents: OrderDocumentsService,
    @Inject(ALTERNATE_LAYOUT)
    private readonly alternateLayout: KeyboardLayout | null,
  ) {}

  /**
   * Bring the customer's view up to the current version, and write to them if
   * asked (FR-NOTIF-03).
   *
   * Two things a manager can be owed here, and they are asked separately
   * because they come apart in practice: the version their page shows, and
   * whether a message went with it. A move taken with the tick cleared leaves
   * the first undone; a move shown to them but not announced leaves the
   * second. Either can be put right afterwards, and neither is the other.
   *
   * Refused only when there is nothing left to do — the customer is on the
   * current version and has been told about it.
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
    // Re-sending what they are already looking at is allowed — a message that
    // went to a spam folder is one somebody has to be able to send again, and
    // it says exactly what their page says. What is refused is the press that
    // would do nothing at all.
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
      // Stamped before the send rather than after it, and stamped whether or
      // not SMTP answers: the mail cannot fail the move that produced it, so
      // "we wrote to them about this version" is what the shop knows, and a
      // silent failure is the log's business rather than the thread's.
      await this.db
        .update(orderRevisions)
        .set({ notifiedAt: new Date() })
        .where(eq(orderRevisions.id, current.revisionId));
      await this.writer.mailCustomer(
        reference,
        notified.number,
        // Whatever the newest version was written for. A manager pressing this
        // is telling the customer where the order now stands, and the version
        // says whether getting there involved changing it.
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
   * Every version of one order, newest first (FR-ORD-03).
   *
   * Read through the same projection and the same mapping a current order is,
   * with the join moved from "the version it points at" to "every version it
   * has": a superseded snapshot is not a different kind of thing, and reading
   * it any other way is how two screens end up describing one order
   * differently.
   */
  async getRevisions(reference: string): Promise<OrderRevisionEntry[]> {
    // The order first, so a reference nobody has is a 404 rather than an empty
    // list — an order with no versions does not exist.
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
        // The thread lists what happened to the order; what can be opened on
        // it belongs to the screens that read one version, so the timeline
        // pays for no document read at all.
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

  /**
   * One version of an order, read on its own (FR-ORD-03).
   *
   * The reading screen asks for the version it is showing rather than for the
   * thread it belongs to: an order worked on for a fortnight has a great many
   * snapshots, and rendering one of them should not cost all of them.
   */
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

  /** The order joined to its versions rather than to the one it stands on —
   * every version, or the one asked for. */
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
    // The documents belong to the order, not to one of its versions — what is
    // read per version is whether each still states what this one says, which
    // is `outdated` against `row.revisionNumber`. Passed in, because the
    // screen reading one version wants them and the thread listing every
    // version does not.
    documents: AdminOrderDetail['documents'] = [],
  ): Promise<OrderRevision> {
    const detail = await this.reads.staffDetail(row, notified, documents);
    return {
      ...detail,
      revisionCreatedAt: row.revisionCreatedAt.toISOString(),
      author: row.revisionCreatedBy
        ? (authors.get(row.revisionCreatedBy) ?? null)
        : null,
      // Who wrote it from outside, where an exchange did (FR-ADM-08). Never
      // resolved against the accounts here: it is the other system's name for
      // one of its own users.
      source: row.source,
      kind: row.revisionKind as OrderRevisionKind,
      note: row.revisionNote,
      customerView: row.customerRevisionNumber === row.revisionNumber,
      notifiedAt: row.revisionNotifiedAt?.toISOString() ?? null,
      // Both are facts about the *order*, and every entry in the list repeats
      // them: read against the version the order stands on rather than against
      // the one being listed, which would make each row answer a question
      // nobody asked about it.
      revisionNumber: row.revisionNumber,
      customerRevisionNumber:
        current.customerRevisionNumber ?? current.revisionNumber,
    };
  }

  /**
   * Staff answering an order. Any status the table allows, from any order.
   *
   * The mail goes out here rather than from the caller, because whether there
   * is one to send is something only the write knows: a move the customer's
   * view followed is news, and a move on an order they have already been told
   * was finished is staff putting their own record straight.
   */
  async transitionForStaff(
    reference: string,
    move: OrderTransition,
    byUserId: string,
  ): Promise<AdminOrderDetail> {
    const before = await this.reads.row(eq(orders.reference, reference));
    // Read before the write, because the write is what changes the answer:
    // this is the version the customer was last told about, and so where the
    // mail's account of the changes has to start.
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
        // An undo is not news the customer is waiting for, and a mail that
        // announced it as the next step would be describing the order moving
        // forwards when it went back.
        moveDirection(before.status as OrderStatus, move.to) === 'backward'
          ? 'corrected'
          : 'moved',
      );
    }
    return this.reads.getForStaff(reference);
  }

  /**
   * What an adjustment would come to (FR-ORD-03), priced and not written.
   *
   * The same arithmetic the write runs, on the same inputs, so the figures a
   * manager approves are the figures that get recorded. It answers with the
   * *proposed* order, not with a diff: what changed is a question about two
   * versions, and the screen holds both.
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
        // A staff screen opens every line it can, whatever the storefront
        // thinks of the product — the flags say what state it is in.
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
   * Change what an order says — a new version of it (FR-ORD-03, ADR 0051).
   *
   * It moves nothing. An order being changed is not an order being answered:
   * a request that a manager corrects is still a request, and a packed order
   * whose address changed is still packed. Whether the customer hears about it
   * is a separate decision — the move that follows carries the news, or the
   * manager asks for it outright.
   *
   * The write is one transaction and the pointer move is guarded by the
   * version it was written against, so two managers adjusting one order have
   * one winner and the loser is told the order moved rather than quietly
   * overwriting a colleague.
   *
   * What the customer wrote is not in the payload at all: their note, their
   * line notes and their preferred date are carried across from the version
   * being superseded.
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
    const lines = priced.lines.map((line, index) => ({
      sortOrder: index,
      productId: line.productId,
      productSourceId: line.sourceId,
      slug: line.slug,
      name: line.name,
      thumbnail: line.thumbnail,
      unit: line.unit,
      quantity: line.quantity,
      pieces: line.pieces,
      priceMinor: line.priceMinor,
      lineTotalMinor: line.lineTotalMinor,
      taxRate: line.taxRate,
      note: line.note,
    }));
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
      // A change the customer has not been told about is not theirs to see:
      // the version they hold is the one the shop last stood behind, and
      // swapping it under them for one nobody has explained is how a page and
      // the message that announced it stop agreeing.
      showCustomer: input.notify,
      notified: input.notify,
      paid: null,
    });

    if (input.notify) {
      await this.writer.mailCustomer(reference, notified.number, 'changed');
    }
    return this.reads.getForStaff(reference);
  }

  /** The order as an adjustment proposes it should now read. The customer's
   * own — their note, their line notes, the day they asked for — is taken from
   * the version being superseded and cannot be sent at all. */
  private adjustedSnapshot(
    current: OrderRow,
    input: OrderAdjustment,
    priced: PricedAdjustment,
    resolved: { billing: AddressInput | null; fulfilment: Fulfilment },
  ): OrderSnapshot {
    const { address: delivery, pickup, zone } = resolved.fulfilment;
    const { billing } = resolved;
    return {
      contactName: input.contact.name,
      contactEmail: input.contact.email,
      contactPhone: input.contact.phone,
      paymentMethod: input.paymentMethod,
      fulfilmentMethod: input.fulfilmentMethod,
      partyName: input.party.name,
      partyRegistrationId: input.party.registrationId,
      billingStreet: billing?.street ?? null,
      billingStreet2: billing?.street2 ?? null,
      billingPostalCode: billing?.postalCode ?? null,
      billingCity: billing?.city ?? null,
      billingRegion: billing?.region ?? null,
      billingCountry: billing?.country ?? null,
      deliveryStreet: delivery?.street ?? null,
      deliveryStreet2: delivery?.street2 ?? null,
      deliveryPostalCode: delivery?.postalCode ?? null,
      deliveryCity: delivery?.city ?? null,
      deliveryRegion: delivery?.region ?? null,
      deliveryCountry: delivery?.country ?? null,
      deliveryZoneKey: zone?.key ?? null,
      deliveryFreeFromMinor: zone?.freeFromMinor ?? null,
      pickupLocationKey: pickup?.key ?? null,
      pickupLocationName: pickup?.name ?? null,
      pickupLocationAddress: pickup?.address ?? null,
      // The customer's own, carried across: an adjustment is the shop's half
      // of the record and never rewrites theirs.
      preferredDate: current.preferredDate,
      customerNote: current.customerNote,
      totalMinor: priced.totalMinor,
      // The order's own currency, not today's config: an old order is priced
      // in what it was priced in, and an adjustment does not re-denominate it.
      currency: current.currency,
      tierKey: input.tierKey,
      shipmentCartons: priced.shipment.cartons,
      shipmentVolume: priced.shipment.volume,
      shipmentWeight: priced.shipment.weight,
      shipmentApproximate: priced.shipment.approximate,
      shipmentUncoveredLines: priced.shipment.uncoveredLines,
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
   * What the payment column is narrowed to — the readings the badge gives, so
   * a manager filters by what they can see. `cash` is the reminder one: an
   * order the shop took on, to be paid in cash, with the handover not recorded
   * yet. `unpaid` is broader and is what the work queue links to: everything
   * the shop has not been paid for, whichever way it was to be paid.
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
   * Find-an-order (FR-AUTH-03): one box over the few fields a manager is
   * holding when they look one up — the reference somebody read out, the name
   * they gave, the party on the invoice, or an email address.
   *
   * A fragment match rather than a prefix: a reference is quoted by its tail as
   * often as whole. The account's own email is matched through its account, so
   * an order placed under one address and contacted at another is found by
   * either.
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
