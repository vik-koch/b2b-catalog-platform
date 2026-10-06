import { Inject, Injectable, Logger } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { RetentionConfig } from '@b2b-catalog-platform/shared';
import { RETENTION } from '../config/deployment-config';
import { DRIZZLE } from '../db/database.module';
import * as schema from '../db/schema';

const DAY_MS = 86_400_000;

export interface SweepResult {
  readonly consentRecords: number;
  readonly destructionRecords: number;
}

/**
 * Deletes the evidence whose retention has ended (NFR-LEGAL-09/12): consent
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
  ) {}

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
        const result = await this.sweep();
        this.logger.log(
          `retention sweep complete: deleted ${result.consentRecords} consent ` +
            `record(s), ${result.destructionRecords} destruction record(s)`,
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
