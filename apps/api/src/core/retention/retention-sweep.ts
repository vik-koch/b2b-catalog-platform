import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, eq, inArray, isNull, lt, ne, or } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { ENDED_ORDER_STATUSES } from '@b2b-catalog-platform/shared/core/ordering';
import { RetentionConfig } from '@b2b-catalog-platform/shared/node';
import { RETENTION } from '../../platform/config/deployment-config';
import { DRIZZLE } from '../../platform/db/database.module';
import * as schema from '../../platform/db/schema';
import {
  consents,
  consentWithdrawals,
  destructionRecords,
  orders,
} from '../../platform/db/schema';
import { OrderDocumentFiles } from '../ordering/order-document-files';
import { scrubOrders } from '../ordering/order-scrub';
import {
  Destruction,
  ORDER_REMOVAL_CATEGORIES,
  recordDestruction,
} from '../../platform/destruction-record';

const DAY_MS = 86_400_000;

export interface SweepResult {
  readonly consentRecords: number;
  readonly destructionRecords: number;
}

/** Ends what the deployment keeps for a period (NFR-LEGAL-09/12/14). */
@Injectable()
export class RetentionSweep {
  private readonly logger = new Logger('RetentionSweep');

  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof schema>,
    @Inject(RETENTION) private readonly retention: RetentionConfig,
    private readonly orderDocuments: OrderDocumentFiles,
  ) {}

  /**
   * Removes the personal details of orders finished (`isOrderFinished`) longer
   * ago than `orderDays`, counted from `updatedAt`, so a reopened or late-paid
   * order starts over. Nobody is mailed. Returns how many it cleared.
   */
  async sweepOrders(now = new Date()): Promise<number> {
    const cutoff = new Date(now.getTime() - this.retention.orderDays * DAY_MS);
    const due = await this.db.transaction(async (tx) => {
      const rows = await tx
        .select({ id: orders.id, userId: orders.userId })
        .from(orders)
        .where(
          and(
            inArray(orders.status, ['completed', ...ENDED_ORDER_STATUSES]),
            ne(orders.paymentState, 'awaiting'),
            isNull(orders.personalDataRemovedAt),
            lt(orders.updatedAt, cutoff),
          ),
        )
        // Two sweeps cannot both clear and record the same order.
        .for('update', { skipLocked: true });
      if (rows.length === 0) return [];

      const ids = rows.map((row) => row.id);
      await scrubOrders(tx, ids);
      // One record per account however many of its orders aged out; a guest
      // order stands for itself.
      const accounts = new Set(rows.flatMap((row) => row.userId ?? []));
      const guests = rows.filter((row) => !row.userId).map((row) => row.id);
      await recordDestruction(
        tx,
        ...[...accounts].map((id) => removed('account', id)),
        ...guests.map((id) => removed('order', id)),
      );
      return ids;
    });
    // After the commit: a file cannot be rolled back with the rows.
    await this.orderDocuments.removeForOrders(due);
    return due.length;
  }

  /**
   * Deletes consent records past `consentRecordDays`, each leaving a
   * destruction record, then destruction records past their own period, which
   * leave none. A consent's period runs from its withdrawal; a contact
   * consent's, used up once answered, from when it was given.
   */
  async sweep(now = new Date()): Promise<SweepResult> {
    const consentCutoff = new Date(
      now.getTime() - this.retention.consentRecordDays * DAY_MS,
    );
    const recordCutoff = new Date(
      now.getTime() - this.retention.destructionRecordDays * DAY_MS,
    );

    return this.db.transaction(async (tx) => {
      // Locked, so a withdrawal entered meanwhile waits, and two sweeps
      // cannot both delete and record the same consent.
      const due = await tx
        .select({ id: consents.id, userId: consents.userId })
        .from(consents)
        .leftJoin(
          consentWithdrawals,
          eq(consentWithdrawals.consentId, consents.id),
        )
        .where(
          or(
            lt(consentWithdrawals.withdrawnAt, consentCutoff),
            and(
              isNull(consentWithdrawals.id),
              eq(consents.purpose, 'contact'),
              lt(consents.createdAt, consentCutoff),
            ),
          ),
        )
        .for('update', { of: consents, skipLocked: true });

      if (due.length > 0) {
        // The withdrawal goes with it by its cascade.
        await tx.delete(consents).where(
          inArray(
            consents.id,
            due.map((row) => row.id),
          ),
        );
        await recordDestruction(
          tx,
          ...due.map((row): Destruction => ({
            // Named by the account where there was one.
            subject: row.userId ? 'account' : 'consent',
            subjectId: row.userId ?? row.id,
            categories: ['consent-record'],
            reason: 'retention-ended',
            by: null,
          })),
        );
      }

      const records = await tx
        .delete(destructionRecords)
        .where(lt(destructionRecords.destroyedAt, recordCutoff));
      return {
        consentRecords: due.length,
        destructionRecords: records.rowCount ?? 0,
      };
    });
  }

  /**
   * Runs both sweeps after `startupDelayMs` and then every `intervalMs`,
   * never overlapping, never crashing the server, never keeping the process
   * alive. Returns a stop function.
   */
  schedule(intervalMs: number, startupDelayMs: number): () => void {
    let running = false;
    const run = async () => {
      if (running) return;
      running = true;
      try {
        // Orders first, so the records they write are dated before the purge looks.
        const cleared = await this.sweepOrders();
        const result = await this.sweep();
        this.logger.log(
          `retention sweep complete: cleared ${cleared} order(s), deleted ` +
            `${result.consentRecords} consent record(s), ` +
            `${result.destructionRecords} destruction record(s)`,
        );
      } catch (error) {
        this.logger.error(
          `retention sweep failed: ${(error as Error).message}`,
        );
      } finally {
        running = false;
      }
    };
    const startup = setTimeout(() => void run(), startupDelayMs);
    const interval = setInterval(() => void run(), intervalMs);
    startup.unref?.();
    interval.unref?.();
    return () => {
      clearTimeout(startup);
      clearInterval(interval);
    };
  }
}

function removed(subject: 'account' | 'order', subjectId: string): Destruction {
  return {
    subject,
    subjectId,
    categories: ORDER_REMOVAL_CATEGORIES,
    reason: 'retention-ended',
    by: null,
  };
}
