import {
  canTransition,
  nextPaymentState,
  OrderActor,
  OrderStatus,
  PaymentMethod,
  PaymentState,
  paymentStateWithoutPayment,
  transitionHasReason,
  transitionNeedsReason,
  AdminOrderDetail,
  OrderNotice,
  OrderRevisionKind,
  TransitionTarget,
} from '@b2b-catalog-platform/shared/core/ordering';
import { effectiveTaxRate, TaxConfig } from '@b2b-catalog-platform/shared';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { and, eq, getTableColumns, sql } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import {
  orderMovedOn,
  refuseIfDetailsRemoved,
  carriedSnapshot,
  OrderRow,
  OrderSnapshot,
} from './order-rows';
import { OrderReader } from './order-reader';
import { TAX_CONFIG } from '../../config/deployment-config';
import { DRIZZLE } from '../../db/database.module';
import {
  customerTiers,
  orderItems,
  orderRevisions,
  orders,
} from '../../db/schema';
import { OrderDocumentsService } from './order-documents.service';
import { OrderNotifications } from './order-notifications';
import { isUniqueViolation } from '../../db/pg-errors';
import * as schema from '../../db/schema';

/**
 * The one writer of order versions (ADR 0051): staff, the customer's cancel and
 * the exchange all move an order through here, so they leave the same thread.
 */
@Injectable()
export class OrderWriter {
  private readonly logger = new Logger('Orders');

  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof schema>,
    private readonly reads: OrderReader,
    private readonly notifications: OrderNotifications,
    private readonly documents: OrderDocumentsService,
    @Inject(TAX_CONFIG) private readonly tax: TaxConfig,
  ) {}

  /**
   * The customer's mail about where their order has got to (FR-NOTIF-03).
   *
   * Read back from the row rather than passed along: the mail says what the
   * order is, and the row is where that is true.
   *
   * `since` is the version they were last written to about, which is what
   * decides the mail's second half. Every change written between then and now
   * is quoted — one mail for a change agreed on the phone and the confirmation
   * that followed it, rather than one per version — and a move with no change
   * behind it says only that the order moved.
   *
   * `notice` is what this message is *for*, which the status alone cannot say:
   * the same `approved` can be the shop accepting an order, the shop walking a
   * packed one back a step, or the shop changing one that was already accepted,
   * and a mail that read them all the same way would tell two of the three a
   * small lie.
   */
  async mailCustomer(
    reference: string,
    since: number,
    notice: OrderNotice,
  ): Promise<void> {
    // None of this may fail the move that produced it — the move is committed,
    // the version is already stamped as written about, and the manager is
    // owed an answer about the order, not about SMTP. The mailer swallows its
    // own failures; this covers the rest of the step, which is real work: two
    // reads and, for an order that owes money, a PDF built on the spot.
    try {
      await this.sendCustomerMail(reference, since, notice);
    } catch (error) {
      this.logger.error(
        `Could not write to the customer about ${reference}`,
        error,
      );
    }
  }

  private async sendCustomerMail(
    reference: string,
    since: number,
    notice: OrderNotice,
  ): Promise<void> {
    // Read through the customer's own projection: the mail describes the
    // version they are shown, and reading it any other way is how a message
    // ends up describing something the page it links to does not.
    const row = await this.reads.row(
      eq(orders.reference, reference),
      'customer',
    );
    const changes = await this.reads.changesSince(row.id, since);
    // The shop's payment instructions travel with any message sent while the
    // money is owed (FR-ORD-05) — an accepted invoiced order whose mail said
    // nothing about how to pay is the gap this closes. Never on an order that
    // owes nothing: attaching a payment slip to "your order is cancelled"
    // would read as a demand.
    const attachment =
      row.paymentState === 'awaiting'
        ? await this.documents.paymentAttachment(reference)
        : null;
    await this.notifications.statusChanged(
      await this.reads.staffDetail(row),
      row.publicToken,
      notice,
      changes,
      attachment ? [attachment] : [],
    );
  }

  /**
   * Move an order (FR-ORD-01/02).
   *
   * The rule lives in the shared transition table and is asked here, once, for
   * every caller — staff, customer and whatever asks next. What the actor may
   * do and what the order's current status permits are the same question and
   * get the same answer: an order that has moved on is not this caller's
   * business to be told about in detail.
   *
   * A move **writes a version** (ADR 0051). The snapshot is carried across
   * word for word — a move changes where the order stands and nothing it says
   * — so the thread of versions is the order's whole history and any point in
   * it can be read back complete. That is what lets a customer be shown the
   * order as they were last told it stood while staff work on a later one.
   *
   * The write re-states the version it read, so two managers answering the
   * same order at the same moment cannot both succeed — the second updates
   * nothing and is refused like any other disallowed move.
   */
  async move(
    where: ReturnType<typeof and>,
    actor: OrderActor,
    to: TransitionTarget,
    reason: string | null,
    byUserId: string,
    told: { notify: boolean; markPaid: boolean; showCustomer: boolean } = {
      notify: false,
      markPaid: false,
      // A customer calling their own order off is looking at the screen that
      // did it: there is nothing to keep from them.
      showCustomer: true,
    },
  ): Promise<OrderRow> {
    const current = await this.reads.row(where);
    refuseIfDetailsRemoved(current);
    const from = current.status as OrderStatus;
    if (!canTransition(actor, from, to)) {
      throw new ConflictException({
        code: 'transition-not-allowed',
        message: 'The order cannot be moved there',
      });
    }
    if (transitionNeedsReason(to, actor) && !reason) {
      throw new BadRequestException({
        code: 'reason-required',
        message: 'Say why, so the customer can be told',
      });
    }
    // The handover of a cash order is one event, so completing it and
    // recording the money is one click. Refused rather than ignored where the
    // order is ending: nothing is owed on an order nobody is filling, and a
    // tick that quietly did nothing would be a manager believing they had
    // recorded a payment.
    if (told.markPaid && transitionHasReason(to)) {
      throw new BadRequestException({
        code: 'payment-not-recordable',
        message: 'Nothing is owed on an order that ends here',
      });
    }
    const paid = told.markPaid && current.paymentState !== 'paid';

    await this.appendRevision(current, {
      kind: 'transition',
      status: to,
      // Only the two refusals carry one, and a move that does not carry a
      // reason clears the one an earlier move left behind.
      statusReason: transitionHasReason(to) ? reason : null,
      byUserId,
      paymentState: paid
        ? 'paid'
        : nextPaymentState(
            current.paymentState as PaymentState,
            current.paymentMethod as PaymentMethod,
            to,
          ),
      movedAt: new Date(),
      // A move is where the order *is*, so the customer's page follows it by
      // default whether or not a message goes with it — otherwise an order out
      // for delivery would still read "confirmed" to the person waiting for
      // it, because a manager decided one mail would do for both steps. Held
      // back only where the caller says so: a step taken by mistake, or one of
      // the intermediate steps an exchange collapses into a single move the
      // customer should read.
      showCustomer: told.showCustomer,
      notified: told.notify,
      paid: paid ? { at: new Date(), by: byUserId } : null,
    });

    // Read back rather than returned from the write: what a caller renders is
    // the order *with* the version it now shows.
    return this.reads.row(eq(orders.id, current.id));
  }

  /**
   * Whether an adjustment would write a version that says exactly what the one
   * before it says.
   *
   * Compared against the two things a version is made of — the snapshot a move
   * would carry across word for word, and the lines it holds — so nothing can
   * change without this seeing it. The manager's note is deliberately not
   * among them: it is an account of a change rather than a change, and a
   * version whose only content is a sentence about nothing is noise in a
   * history rather than part of one.
   *
   * The refusal lives here and not in the screen because the screen is not the
   * only writer: an exchange that re-sends an order it has already sent must
   * not lengthen the thread by doing so.
   */
  async saysTheSame(
    current: OrderRow,
    snapshot: OrderSnapshot,
    lines: Omit<typeof orderItems.$inferInsert, 'revisionId'>[],
  ): Promise<boolean> {
    const carried = carriedSnapshot(current);
    const sameSnapshot = Object.entries(snapshot).every(
      ([field, value]) => value === carried[field as keyof OrderSnapshot],
    );
    if (!sameSnapshot) return false;

    const items = await this.reads.items(current.revisionId);
    if (items.length !== lines.length) return false;
    return lines.every((line, index) => {
      const item = items[index];
      return (
        line.sortOrder === item.sortOrder &&
        line.productId === item.productId &&
        line.slug === item.slug &&
        line.name === item.name &&
        line.thumbnail === item.thumbnail &&
        line.unit === item.unit &&
        line.quantity === item.quantity &&
        line.pieces === item.pieces &&
        line.priceMinor === item.priceMinor &&
        line.lineTotalMinor === item.lineTotalMinor &&
        line.taxRate === item.taxRate &&
        line.note === item.note
      );
    });
  }

  /**
   * The one write every version of an order goes through: the version, the
   * order's pointers, and the lines — one transaction, so an order can never
   * point at a version whose lines are half there.
   *
   * A move carries the snapshot and the lines across untouched; an adjustment
   * supplies both. Nothing else distinguishes them, which is the point: two
   * ways of writing a version would be two ways for the thread to develop a
   * hole in it.
   */
  async appendRevision(
    current: OrderRow,
    change: {
      kind: OrderRevisionKind;
      status: OrderStatus;
      statusReason: string | null;
      note?: string | null;
      byUserId: string | null;
      /** The outside system's own name for whoever acted, where an exchange
       * wrote this version (FR-ADM-08). Null for everything written here. */
      source?: string | null;
      snapshot?: OrderSnapshot;
      lines?: Omit<typeof orderItems.$inferInsert, 'revisionId'>[];
      paymentState: PaymentState;
      /** When the order moved, or null where it did not move at all. */
      movedAt: Date | null;
      /** Whether this is the version the customer is now shown. */
      showCustomer: boolean;
      /**
       * Whether a message about this version goes out.
       *
       * Stamped here rather than after the send, and in the same transaction
       * as the version it describes: the mail cannot fail the write that
       * produced it, so "we wrote to them about this version" is what the shop
       * knows, and a silent SMTP failure is the log's business rather than the
       * thread's.
       */
      notified: boolean;
      /** The money, where it arrived with this version — the handover of a
       * cash order, recorded with the move that is the handover. `by` is null
       * where no person recorded it. */
      paid: { at: Date; by: string | null } | null;
      /** A payment recorded in error, taken back with this version. The record
       * is cleared rather than contradicted: an order that was never paid must
       * not keep saying when it was. */
      unpaid?: boolean;
    },
  ): Promise<void> {
    try {
      await this.db.transaction(async (tx) => {
        const [revision] = await tx
          .insert(orderRevisions)
          .values({
            orderId: current.id,
            revisionNumber: current.revisionNumber + 1,
            kind: change.kind,
            status: change.status,
            statusReason: change.statusReason,
            createdBy: change.byUserId,
            note: change.note ?? null,
            notifiedAt: change.notified ? new Date() : null,
            ...(change.snapshot ?? carriedSnapshot(current)),
            // After the snapshot, not before it: `source` is a fact about who
            // wrote this version rather than part of what the order says, and
            // a snapshot must never be able to carry one across.
            source: change.source ?? null,
          })
          .returning({ id: orderRevisions.id });

        const [pointed] = await tx
          .update(orders)
          .set({
            currentRevisionId: revision.id,
            // Whatever else this version did, it happened to the order: the
            // outbound read (FR-ADM-08) orders and pages by this, so a
            // version nobody stamped is a version nothing outside ever sees.
            updatedAt: new Date(),
            ...(change.showCustomer ? { customerRevisionId: revision.id } : {}),
            status: change.status,
            paymentState: change.paymentState,
            // Two facts, written together because they are one observation:
            // a payment state of `paid` and the record of who saw the money
            // arrive and when.
            ...(change.paid
              ? { paidAt: change.paid.at, paidBy: change.paid.by }
              : {}),
            ...(change.unpaid ? { paidAt: null, paidBy: null } : {}),
            // Only a real move is a move: the line that says when the order
            // last moved must not be restated by a change that left it where
            // it was.
            ...(change.movedAt
              ? {
                  statusChangedAt: change.movedAt,
                  statusChangedBy: change.byUserId,
                }
              : {}),
          })
          // The version it was written against, restated in the write: the
          // second of two writers updates nothing and is told so.
          .where(
            and(
              eq(orders.id, current.id),
              eq(orders.currentRevisionId, current.revisionId),
            ),
          )
          .returning({ id: orders.id });

        if (!pointed) throw orderMovedOn();

        if (change.lines) {
          await tx.insert(orderItems).values(
            change.lines.map((line) => ({
              ...line,
              revisionId: revision.id,
            })),
          );
        } else {
          // Copied in the database rather than read out and written back: the
          // lines are unchanged, and a round trip through this process is a
          // chance for them to stop being. Drizzle inserts into every column
          // in the table's order, which the spread keeps.
          await tx.insert(orderItems).select(
            tx
              .select({
                ...getTableColumns(orderItems),
                revisionId: sql<string>`${revision.id}::uuid`.as('revisionId'),
              })
              .from(orderItems)
              .where(eq(orderItems.revisionId, current.revisionId)),
          );
        }
      });
    } catch (error) {
      // Two writers reaching the insert together: the version number is unique
      // per order, so the second collides on it rather than on the pointer the
      // write also restates. Same answer either way.
      if (!isUniqueViolation(error)) throw error;
      throw orderMovedOn();
    }
  }

  /**
   * The rate a line written into this order states, from the product's own
   * (NFR-LEGAL-11). The order's basis decides whether there is a rate at all
   * — it never changes after submission — and the deployment's default fills
   * in today's where the product carries none.
   */
  lineTaxRate(order: OrderRow): (own: number | null) => number | null {
    return (own) =>
      order.taxBasis === 'none' ? null : effectiveTaxRate(this.tax, own);
  }

  /** The price list an adjustment names, as an id. Null is the default one. */
  async tierId(key: string | null): Promise<string | null> {
    if (!key) return null;
    const [tier] = await this.db
      .select({ id: customerTiers.id })
      .from(customerTiers)
      .where(eq(customerTiers.key, key))
      .limit(1);
    if (!tier) {
      throw new BadRequestException({
        code: 'unknown-tier',
        message: 'That price list does not exist',
      });
    }
    return tier.id;
  }

  /**
   * Record that the money arrived, or take that record back (FR-ORD-04) — a
   * manager's observation, not a transaction. It moves nothing else: a cash
   * order is recorded as paid at the handover and an invoiced one whenever the
   * transfer lands, and neither says anything about where the order stands.
   *
   * Clearing it is the same correction reopening is: a box ticked by mistake
   * must not leave an order marked paid for good, and the shop's books are
   * where a real refund lives. What it clears *to* is not the state the order
   * was in before — that is not recorded — but what its method and status say
   * it owes now.
   */
  async setPayment(
    reference: string,
    paid: boolean,
    /** Null where an exchange recorded it: `paidBy` names a person, and an
     * owning system is not one (FR-ADM-08). */
    byUserId: string | null,
  ): Promise<AdminOrderDetail> {
    const current = await this.reads.row(eq(orders.reference, reference));
    const cleared = paymentStateWithoutPayment(
      current.status as OrderStatus,
      current.paymentMethod as PaymentMethod,
    );

    const [changed] = await this.db
      .update(orders)
      .set(
        paid
          ? {
              paymentState: 'paid',
              paidAt: new Date(),
              paidBy: byUserId,
              updatedAt: new Date(),
            }
          : {
              paymentState: cleared,
              paidAt: null,
              paidBy: null,
              updatedAt: new Date(),
            },
      )
      .where(
        and(
          eq(orders.id, current.id),
          // Not already where it is being asked to go, and never on an order
          // nobody owes anything on. Restated in the write rather than checked
          // first, so two managers cannot both record the same payment.
          paid
            ? sql`${orders.paymentState} <> 'paid'`
            : sql`${orders.paymentState} = 'paid'`,
          sql`${orders.status} not in ('declined', 'cancelled')`,
        ),
      )
      .returning();

    if (!changed) {
      throw new ConflictException({
        code: 'payment-not-recordable',
        message: 'Nothing to change on this order',
      });
    }
    return this.reads.getForStaff(reference);
  }
}
