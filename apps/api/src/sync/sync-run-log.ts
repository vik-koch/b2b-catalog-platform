import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, lt } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { SyncArea, SyncRun, SyncRunStatus } from '@b2b-catalog-platform/shared';
import { DRIZZLE } from '../db/database.module';
import * as schema from '../db/schema';
import { syncRuns } from '../db/schema';

/** Staged rows and finished runs are audit data, not archive data. */
const RUN_RETENTION_DAYS = 90;

/**
 * The parts of a run's life that are the same whatever it carries (ADR 0060):
 * retention, which staged run the next one replaces, and where the feed stood
 * before it.
 */
@Injectable()
export class SyncRunLog {
  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  /**
   * The status of the automated run before this one in this area, or null
   * where there has never been one. Uploads are left out: a person previewing
   * their own file is not the feed's state, and it is their screen that
   * answers them.
   *
   * Read *before* the new run is written, because inserting one supersedes the
   * staged run it overtakes — asked afterwards, the question answers itself.
   */
  async previousMachineStatus(area: SyncArea): Promise<SyncRunStatus | null> {
    const [row] = await this.db
      .select({ status: syncRuns.status })
      .from(syncRuns)
      .where(and(eq(syncRuns.source, 'api'), eq(syncRuns.area, area)))
      .orderBy(desc(syncRuns.startedAt))
      .limit(1);
    return row?.status ?? null;
  }

  /**
   * Retires whatever headless run of this area is still staged, because this
   * one replaces it.
   *
   * A staged run is a snapshot of a diff that was true when it was taken. Two
   * hour-old previews from a quarter-hourly feed are not a backlog to work
   * through, they are noise, and only the newest is worth applying. An admin's
   * own upload is left alone: it is theirs, and nothing a machine sends
   * supersedes a decision a person is in the middle of.
   */
  async supersedeStaged(area: SyncArea): Promise<void> {
    await this.db
      .update(syncRuns)
      .set({
        status: 'superseded',
        finishedAt: new Date(),
        rows: null,
        parseErrors: null,
      })
      .where(
        and(
          eq(syncRuns.status, 'previewed'),
          eq(syncRuns.source, 'api'),
          eq(syncRuns.area, area),
        ),
      );
  }

  /** Drops staged rows and whole runs past the retention window. Area-blind on
   * purpose: age is age, whatever a run carried. */
  async prune(): Promise<void> {
    const cutoff = new Date(Date.now() - RUN_RETENTION_DAYS * 86_400_000);
    await this.db.delete(syncRuns).where(lt(syncRuns.startedAt, cutoff));
    // An abandoned preview holds a whole catalog in `rows`; drop the payload
    // after a day while keeping the run itself in the audit trail.
    await this.db
      .update(syncRuns)
      .set({ rows: null, parseErrors: null })
      .where(
        and(
          eq(syncRuns.status, 'previewed'),
          lt(syncRuns.startedAt, new Date(Date.now() - 86_400_000)),
        ),
      );
  }
}

/** One stored run as the contract describes it. Shared, because a run reads
 * the same whatever area it belongs to. */
export function toSyncRun(row: typeof syncRuns.$inferSelect): SyncRun {
  return {
    id: row.id,
    status: row.status,
    area: row.area,
    source: row.source,
    filename: row.filename,
    startedAt: row.startedAt.toISOString(),
    finishedAt: row.finishedAt ? row.finishedAt.toISOString() : null,
    actorEmail: row.actorEmail,
    tokenName: row.tokenName,
    stagedReason: row.stagedReason,
    options: row.options,
    summary: row.summary,
    error: row.error,
    notice: row.notice,
  };
}
