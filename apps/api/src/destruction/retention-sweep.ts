import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, inArray, isNull, lt, ne, sql } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import {
  ENDED_ORDER_STATUSES,
  RetentionConfig,
} from '@b2b-catalog-platform/shared';
import { RETENTION } from '../config/deployment-config';
import { DRIZZLE } from '../db/database.module';
import * as schema from '../db/schema';
import { destructionRecords, orders } from '../db/schema';
import { OrderDocumentFiles } from '../orders/order-document-files';
import { scrubOrders } from '../orders/order-scrub';
import { ORDER_REMOVAL_CATEGORIES } from './record-destruction';

const DAY_MS = 86_400_000;

export interface SweepResult {
  readonly consentRecords: number;
  readonly destructionRecords: number;
}

/**
 * Ends what the deployment keeps for a period (NFR-LEGAL-09/12/14).
 *
 * The orders' personal details go first (`sweepOrders`). Then the evidence
 * whose retention has ended (`sweep`): consent
 * records first, each leaving a destruction record in the same statement,
 * then the destruction records old enough to go themselves — which leave
 * none, or the sweep would never finish its own work.
 *
 * A consent's retention runs from its withdrawal; a contact consent's, which
 * is used up once answered, from when it was given if nobody withdrew it. An
 * account consent never withdrawn is kept while the account is.
 */
@Injectable()
export class RetentionSweep {
  private readonly logger = new Logger('RetentionSweep');

  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof schema>,
    @Inject(RETENTION) private readonly retention: RetentionConfig,
    private readonly orderDocuments: OrderDocumentFiles,
  ) {}

  /**
   * Removes the personal details from every order finished longer ago than
   * the deployment keeps them (NFR-LEGAL-14), with one destruction record per
   * account and per guest order, in the same transaction. Nobody is mailed:
   * the period is the privacy policy's to state, not news about an order.
   *
   * "Finished" is `isOrderFinished` in SQL: filled or ended, and no payment
   * awaited. Its period runs from `updatedAt`, the last thing that happened
   * to it, so an order reopened or paid late starts over. Returns how many
   * orders it cleared.
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
      // One record per person, not per order: an account is one subject
      // however many of its orders aged out today. A guest order names
      // nobody else, so it stands for itself.
      const accounts = [
        ...new Set(rows.flatMap((row) => (row.userId ? [row.userId] : []))),
      ];
      const guests = rows.filter((row) => !row.userId).map((row) => row.id);
      await tx.insert(destructionRecords).values(
        [
          ...accounts.map((id) => ({ subject: 'account', subjectId: id })),
          ...guests.map((id) => ({ subject: 'order', subjectId: id })),
        ].map((subject) => ({
          ...subject,
          categories: [...ORDER_REMOVAL_CATEGORIES],
          reason: 'retention-ended',
        })),
      );
      return ids;
    });
    // After the commit, as an account deletion does: files cannot be rolled
    // back, and an order already cleared with its file still on disk is the
    // harmless way round.
    await this.orderDocuments.removeForOrders(due);
    return due.length;
  }

  async sweep(now = new Date()): Promise<SweepResult> {
    const consentCutoff = new Date(
      now.getTime() - this.retention.consentRecordDays * DAY_MS,
    );
    const recordCutoff = new Date(
      now.getTime() - this.retention.destructionRecordDays * DAY_MS,
    );

    return this.db.transaction(async (tx) => {
      // One statement, so no consent is deleted without its record. The
      // withdrawal goes with it by its cascade. The person is named by their
      // account where there was one, else by the record itself.
      const consents = await tx.execute(sql`
        WITH gone AS (
          DELETE FROM consents c
           WHERE coalesce(
                   (SELECT w."withdrawnAt" FROM consent_withdrawals w
                     WHERE w."consentId" = c.id),
                   CASE WHEN c.purpose = 'contact' THEN c."createdAt" END
                 ) < ${consentCutoff}
          RETURNING c.id, c."userId")
        INSERT INTO destruction_records (subject, "subjectId", categories, reason)
        SELECT CASE WHEN "userId" IS NULL THEN 'consent' ELSE 'account' END,
               coalesce("userId", id),
               ARRAY['consent-record']::varchar[],
               'retention-ended'
          FROM gone`);
      const records = await tx.execute(sql`
        DELETE FROM destruction_records WHERE "destroyedAt" < ${recordCutoff}`);
      return {
        consentRecords: consents.rowCount ?? 0,
        destructionRecords: records.rowCount ?? 0,
      };
    });
  }

  /**
   * Runs the sweep now-ish and then daily, in-process, as the media prune
   * does. Never overlapping, never crashing the server over a failed run, and
   * never keeping the process alive by itself. Returns a stop function.
   */
  schedule(intervalMs: number, startupDelayMs: number): () => void {
    let running = false;
    const run = async () => {
      if (running) return;
      running = true;
      try {
        // Orders first, so the records they write are dated before the
        // record purge looks.
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
