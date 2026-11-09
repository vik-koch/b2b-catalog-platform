import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { eq, inArray } from 'drizzle-orm';

import { ProductUnit } from '@b2b-catalog-platform/shared/core/catalog';
import { OrderWriteResult } from '@b2b-catalog-platform/shared/core/exchange';
import {
  canTransition,
  moveDirection,
  nextPaymentState,
  OrderStatus,
  PaymentMethod,
  PaymentState,
  paymentStateAfterAdjustment,
  paymentStateWithoutPayment,
  transitionHasReason,
  transitionNeedsReason,
} from '@b2b-catalog-platform/shared/core/ordering';
import {
  OrderSyncLine,
  OrderWrite,
} from '@b2b-catalog-platform/shared/machine/exchange';

import { products } from '../../core/catalog/catalog-schema';
import {
  priceAdjustment,
  PricedAdjustment,
} from '../../core/ordering/order-adjustment';
import { OrderReader } from '../../core/ordering/order-reader';
import {
  adjustedItems,
  carriedSnapshot,
  OrderRow,
  OrderSnapshot,
  refuseIfDetailsRemoved,
  shipmentColumns,
} from '../../core/ordering/order-rows';
import { OrderWriter } from '../../core/ordering/order-writer';
import { orderItems, orders } from '../../core/ordering/ordering-schema';
import { Database } from '../../platform/db/database';
import { DRIZZLE } from '../../platform/db/database.module';

/**
 * Whether the customer called the order off themselves (FR-ADM-08/10), read
 * off who wrote the current version: their own account, a manager's, or
 * nobody's for an exchange.
 */
export function cancelledByCustomer(row: {
  revisionCreatedBy: string | null;
  userId: string | null;
}): boolean {
  return row.revisionCreatedBy !== null && row.revisionCreatedBy === row.userId;
}

/**
 * An owning system answering an order (FR-ADM-08): a move, a re-pricing and a
 * payment in one instruction write at most one version. None where
 * it says what the order already says (FR-ADM-16) or only records money. A
 * customer's own cancellation is taken back only by saying so and telling them,
 * and the customer's own words are carried across untouched.
 */
@Injectable()
export class OrderWriteBack {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly reads: OrderReader,
    private readonly writer: OrderWriter,
  ) {}

  /** One instruction, so an order accepted, re-priced and paid between two
   * polls reads as one thing that happened to it. */
  async writeBack(
    input: OrderWrite,
    source: string,
  ): Promise<OrderWriteResult> {
    const current = await this.reads.row(eq(orders.reference, input.reference));
    // Up front, so a stale instruction is told so instead of losing a race.
    if (current.revisionNumber !== input.basedOnRevision) {
      throw new ConflictException({
        code: 'order-changed',
        message: `The order now stands at version ${current.revisionNumber}`,
        current: current.revisionNumber,
      });
    }
    const from = current.status as OrderStatus;
    const to = input.status ?? from;
    const moved = to !== from;
    // Only the customer's cancellation stops the exchange: one the system made
    // is its own to reopen, and the panel is closed while it owns orders.
    // Taking the customer's back must say so and tell them.
    if (current.status === 'cancelled' && cancelledByCustomer(current)) {
      if (!input.restoreCustomerCancellation || !moved) {
        throw new ConflictException({
          code: 'order-called-off',
          message: 'The customer called this order off',
        });
      }
      if (!input.notify || !input.showCustomer) {
        throw new BadRequestException({
          code: 'restore-not-announced',
          message: 'Taking back a customer cancellation has to tell them',
        });
      }
    }
    // As `machine`: an exchange reports a state, not one click per step.
    if (moved && !canTransition('machine', from, to)) {
      throw new ConflictException({
        code: 'transition-not-allowed',
        message: `The order cannot go from ${from} to ${to}`,
      });
    }
    if (moved && transitionNeedsReason(to, 'machine') && !input.statusReason) {
      throw new BadRequestException({
        code: 'reason-required',
        message: 'Say why, so the customer can be told',
      });
    }

    const method = current.paymentMethod as PaymentMethod;
    const paying = input.paid === true && current.paymentState !== 'paid';
    const unpaying = input.paid === false && current.paymentState === 'paid';
    // Nothing is owed on an order nobody is filling, as for a manager's tick.
    if (paying && transitionHasReason(to)) {
      throw new BadRequestException({
        code: 'payment-not-recordable',
        message: 'Nothing is owed on an order that ends here',
      });
    }

    const written = input.lines
      ? await this.writtenBackLines(input.lines, current)
      : null;
    const snapshot = written
      ? this.rewrittenSnapshot(current, written.priced)
      : carriedSnapshot(current);
    const changed =
      written !== null &&
      !(await this.writer.saysTheSame(current, snapshot, written.lines));

    // A note rides on a version, and the next two answers write none: reported
    // (`noteIgnored`) rather than refused, so a source re-sending its whole
    // snapshot is not refused forever.
    const droppedNote = Boolean(input.note);

    if (!moved && !changed && !paying && !unpaying) {
      // The ordinary answer to a source that cannot remember what it sent.
      return this.writeResult(current, 'unchanged', false, droppedNote);
    }

    // The money on its own is not a version, as for a manager.
    if (!moved && !changed) {
      await this.writer.setPayment(
        input.reference,
        input.paid as boolean,
        null,
      );
      const after = await this.reads.row(eq(orders.reference, input.reference));
      return this.writeResult(after, 'payment', false, droppedNote);
    }

    // After the two answers that write no version, so a source re-sending
    // its snapshot of a finished order is still told `unchanged`.
    refuseIfDetailsRemoved(current);

    // Before the write, which changes where the customer's account starts.
    const notified = await this.reads.customerThread(current.id);
    await this.writer.appendRevision(current, {
      // A version that moved and changed the order is filed as the change.
      kind: changed ? 'adjustment' : 'transition',
      status: to,
      // Only the two refusals carry one, and a move that does not carry a
      // reason clears the one an earlier move left behind.
      statusReason: transitionHasReason(to)
        ? (input.statusReason ?? null)
        : null,
      note: input.note ?? null,
      byUserId: null,
      source,
      snapshot: written ? snapshot : undefined,
      lines: written?.lines,
      paymentState: paying
        ? 'paid'
        : unpaying
          ? paymentStateWithoutPayment(to, method)
          : moved
            ? nextPaymentState(current.paymentState as PaymentState, method, to)
            : paymentStateAfterAdjustment(
                current.paymentState as PaymentState,
                to,
                method,
              ),
      movedAt: moved ? new Date() : null,
      showCustomer: input.showCustomer,
      notified: input.notify,
      paid: paying ? { at: new Date(), by: null } : null,
      unpaid: unpaying,
    });

    if (input.notify) {
      await this.writer.mailCustomer(
        input.reference,
        notified.number,
        // Content and status can move in the same revision. Explain the new
        // status when it moved; 'changed' wording promises it stayed put.
        moved
          ? moveDirection(from, to) === 'backward'
            ? 'corrected'
            : 'moved'
          : 'changed',
      );
    }
    const after = await this.reads.row(eq(orders.reference, input.reference));
    return this.writeResult(
      after,
      changed ? 'adjustment' : 'transition',
      input.notify,
    );
  }

  /** What the exchange is told it did, read off the order as it now stands. */
  private writeResult(
    row: OrderRow,
    kind: OrderWriteResult['kind'],
    notified: boolean,
    noteIgnored = false,
  ): OrderWriteResult {
    return {
      reference: row.reference,
      kind,
      status: row.status as OrderStatus,
      paymentState: row.paymentState as PaymentState,
      revisionNumber: row.revisionNumber,
      notified,
      noteIgnored,
    };
  }

  /**
   * The instruction's lines, by the source's product keys (FR-ADM-02), priced
   * through the adjustment's pricer. The unit and line note are the customer's
   * and are read off the line being replaced.
   */
  private async writtenBackLines(
    lines: readonly OrderSyncLine[],
    current: OrderRow,
  ): Promise<{
    priced: PricedAdjustment;
    lines: Omit<typeof orderItems.$inferInsert, 'revisionId'>[];
  }> {
    const keys = lines.map((line) => line.productSourceId);
    const duplicate = keys.find((key, index) => keys.indexOf(key) !== index);
    if (duplicate) {
      throw new BadRequestException({
        code: 'duplicate-product',
        message: `${duplicate} is on this order twice`,
        productSourceId: duplicate,
      });
    }

    // Hidden and withdrawn included: an order may hold what the shop no longer
    // lists.
    const rows = await this.db
      .select({ sourceId: products.sourceId, slug: products.slug })
      .from(products)
      .where(inArray(products.sourceId, keys));
    const slugs = new Map(rows.map((row) => [row.sourceId, row.slug]));
    const unknown = keys.find((key) => !slugs.has(key));
    if (unknown) {
      throw new BadRequestException({
        code: 'unknown-product',
        message: `No product carries the key ${unknown}`,
        productSourceId: unknown,
      });
    }

    // What the customer read each line in, kept: a line bought by the box
    // still reads in boxes after the shop re-counts it.
    const [items, tierId] = await Promise.all([
      this.reads.items(current.revisionId),
      this.writer.tierId(current.tierKey),
    ]);
    const carried = new Map(items.map((item) => [item.productSourceId, item]));
    const priced = await priceAdjustment(
      this.db,
      lines.map((line) => {
        const before = carried.get(line.productSourceId);
        return {
          slug: slugs.get(line.productSourceId) as string,
          pieces: line.pieces,
          unit: (before?.unit as ProductUnit | undefined) ?? null,
          note: before?.note ?? null,
          priceMinor: line.priceMinor,
        };
      }),
      tierId,
      this.writer.lineTaxRate(current),
    );
    return {
      priced,
      lines: adjustedItems(priced),
    };
  }

  /**
   * Every snapshot column carried, with the lines' figures recomputed. Narrower
   * than an adjustment on purpose: contact, party, addresses and fulfilment are
   * the customer's answers, not the owning system's to overwrite.
   */
  private rewrittenSnapshot(
    current: OrderRow,
    priced: PricedAdjustment,
  ): OrderSnapshot {
    return {
      ...carriedSnapshot(current),
      totalMinor: priced.totalMinor,
      ...shipmentColumns(priced.shipment),
    };
  }
}
