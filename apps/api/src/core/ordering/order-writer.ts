import {
  effectiveTaxRate,
  TaxConfig,
} from '@b2b-catalog-platform/shared/core/catalog';
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
} from '@b2b-catalog-platform/shared/core/ordering';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { and, eq, getTableColumns, sql } from 'drizzle-orm';
import {
  orderMovedOn,
  refuseIfDetailsRemoved,
  carriedSnapshot,
  OrderRow,
  OrderSnapshot,
} from './order-rows';
import { OrderReader } from './order-reader';
import { TAX_CONFIG } from '../catalog/catalog-config';
import { DRIZZLE } from '../../platform/db/database.module';
import { customerTiers } from '../catalog/catalog-schema';
import { orderItems, orderRevisions, orders } from './ordering-schema';
import { OrderDocumentsService } from './order-documents.service';
import { OrderNotifications } from './order-notifications';
import { isUniqueViolation } from '../../platform/db/pg-errors';
import { Database } from '../../platform/db/database';

/**
 * The one writer of order versions: staff, the customer's cancel and
 * the exchange all move an order through here, so they leave the same thread.
 */
@Injectable()
export class OrderWriter {
  private readonly logger = new Logger('Orders');

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly reads: OrderReader,
    private readonly notifications: OrderNotifications,
    private readonly documents: OrderDocumentsService,
    @Inject(TAX_CONFIG) private readonly tax: TaxConfig,
  ) {}

  /**
   * Writes to the customer about where their order has got to (FR-NOTIF-03),
   * read back from the row. Every change since `since` is quoted, so one mail
   * covers a change and its confirmation. `notice` says what the mail is for:
   * the same status can be news, a correction or a change.
   */
  async mailCustomer(
    reference: string,
    since: number,
    notice: OrderNotice,
  ): Promise<void> {
    // Never fails the move: it is committed and stamped, and the manager is
    // owed an answer about the order, not SMTP. This covers the reads and the
    // PDF.
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
    // The customer's own projection: the mail describes the page it links to.
    const row = await this.reads.row(
      eq(orders.reference, reference),
      'customer',
    );
    const changes = await this.reads.changesSince(row.id, since);
    // The payment instructions ride along while money is owed (FR-ORD-05),
    // never on a mail that owes nothing.
    const attachment =
      row.paymentState === 'awaiting'
        ? await this.documents.paymentAttachment(row.id)
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
   * Moves an order (FR-ORD-01/02), asked of the transition table for every
   * actor. A move writes a version with the snapshot carried across word for
   * word, and restates the version it read, so the second of two
   * managers is refused.
   */
  async move(
    where: ReturnType<typeof and>,
    actor: OrderActor,
    to: OrderStatus,
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
    // Completing a cash order and recording its money is one click. Refused on
    // an ending: a tick that did nothing would be a payment a manager believes
    // in.
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
      // The customer's page follows a move unless the caller holds it back: a
      // mistaken step, or a step an exchange collapses.
      showCustomer: told.showCustomer,
      notified: told.notify,
      paid: paid ? { at: new Date(), by: byUserId } : null,
    });

    // Read back rather than returned from the write: what a caller renders is
    // the order *with* the version it now shows.
    return this.reads.row(eq(orders.id, current.id));
  }

  /**
   * Whether a version would say exactly what the one before it says: snapshot
   * and lines. The note does not count, a sentence about nothing is noise. Here
   * rather than in the screen, so an exchange re-sending cannot grow the
   * thread.
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
   * The one write every version goes through: the version, the order's pointers
   * and the lines in one transaction. A move carries snapshot and lines across;
   * an adjustment supplies them.
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
       * Stamped with the write, not after the send: the mail cannot fail the
       * write, so the thread records what the shop sent.
       */
      notified: boolean;
      /**
       * The cash handover recorded with the move that is the handover; `by` is
       * null where no person recorded it.
       */
      paid: { at: Date; by: string | null } | null;
      /** A payment recorded in error, cleared rather than contradicted. */
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
            // After the snapshot: who wrote a version is not something a
            // snapshot carries.
            source: change.source ?? null,
          })
          .returning({ id: orderRevisions.id });

        const [pointed] = await tx
          .update(orders)
          .set({
            currentRevisionId: revision.id,
            // The outbound read pages by `updatedAt` (FR-ADM-08).
            updatedAt: new Date(),
            ...(change.showCustomer ? { customerRevisionId: revision.id } : {}),
            status: change.status,
            paymentState: change.paymentState,
            // `paid` and who saw the money arrive are one observation.
            ...(change.paid
              ? { paidAt: change.paid.at, paidBy: change.paid.by }
              : {}),
            ...(change.unpaid ? { paidAt: null, paidBy: null } : {}),
            // An adjustment leaves where the order stands, and when it got
            // there.
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
          // Copied in the database: unchanged lines never round-trip through
          // this process. Drizzle inserts every column in table order, which
          // the spread keeps.
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
      // Two writers at once collide on the version number; same answer.
      if (!isUniqueViolation(error)) throw error;
      throw orderMovedOn();
    }
  }

  /**
   * A line's rate (NFR-LEGAL-11): none under the order's own basis `none`,
   * otherwise the product's own or today's default.
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
   * Records the money as arrived, or takes that back (FR-ORD-04): an
   * observation, not a transaction. Cleared, the order owes what its method and
   * status say; the earlier state is not recorded.
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
          // Restated in the write, so two managers cannot both record it; never
          // on an order nobody owes anything on.
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
