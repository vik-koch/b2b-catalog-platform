import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, isNotNull, lt, or } from 'drizzle-orm';

import {
  MachineSyncRun,
  SyncArea,
  SyncFailureReport,
  SyncRun,
  SyncRunStatus,
} from '@b2b-catalog-platform/shared/core/exchange';

import { Database } from '../../platform/db/database';
import { DRIZZLE } from '../../platform/db/database.module';
import { syncRuns } from './exchange-schema';
import { runNotFound, Submitter } from './sync-run';

/** Staged rows and finished runs are audit data, not archive data. */
const RUN_RETENTION_DAYS = 90;

/** What a run's life shares across areas: retention, which staged run the
 * next one replaces, and where the feed stood before it. */
@Injectable()
export class SyncRunLog {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /**
   * The area's previous automated run's status, or null. Uploads are not the
   * feed's state. Read before the new run is written: inserting it supersedes
   * the staged one, and the question would answer itself.
   */
  async previousMachineStatus(area: SyncArea): Promise<SyncRunStatus | null> {
    const [row] = await this.db
      .select({ status: syncRuns.status })
      .from(syncRuns)
      .where(and(eq(syncRuns.source, 'api'), eq(syncRuns.area, area)))
      .orderBy(desc(syncRuns.seq))
      .limit(1);
    return row?.status ?? null;
  }

  /**
   * One run for the automated source (FR-ADM-09), scoped by area rather than
   * by token: a rotated credential is the same source. A run of another area
   * is missing, not refused, so its existence does not leak.
   */
  async findForMachine(id: string, area: SyncArea): Promise<MachineSyncRun> {
    const [row] = await this.db
      .select()
      .from(syncRuns)
      .where(and(eq(syncRuns.id, id), eq(syncRuns.area, area)))
      .limit(1);
    if (!row) throw runNotFound();
    return toMachineSyncRun(toSyncRun(row));
  }

  /** Retires the area's staged headless run: only the newest snapshot of a
   * feed is worth applying. A feed leaves an admin's own upload alone; a new
   * upload retires every staged run, its own kind included. */
  async supersedeStaged(
    area: SyncArea,
    { uploads = false } = {},
  ): Promise<void> {
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
          uploads ? undefined : eq(syncRuns.source, 'api'),
          eq(syncRuns.area, area),
        ),
      );
  }

  /**
   * A breakage the client could not turn into a run, recorded as a failed
   * one: a broken feed must not look like one with nothing to send. Returns
   * the status before it, for the notice.
   */
  async recordFailure(
    area: SyncArea,
    report: SyncFailureReport,
    submitter: Submitter,
  ): Promise<{ run: SyncRun; previous: SyncRunStatus | null }> {
    const previous = await this.previousMachineStatus(area);
    const now = new Date();
    const [row] = await this.db
      .insert(syncRuns)
      .values({
        area,
        status: 'failed',
        source: 'api',
        filename: report.label ?? null,
        tokenId: submitter.id,
        tokenName: submitter.name,
        startedAt: now,
        finishedAt: now,
        error: report.message,
      })
      .returning();
    return { run: toSyncRun(row), previous };
  }

  /** Drops staged rows and whole runs past retention, whatever the area,
   * except that a customer run's people go sooner. */
  async prune(): Promise<void> {
    const cutoff = new Date(Date.now() - RUN_RETENTION_DAYS * 86_400_000);
    const dayAgo = new Date(Date.now() - 86_400_000);
    await this.db.delete(syncRuns).where(lt(syncRuns.startedAt, cutoff));
    // An abandoned preview holds a whole catalog in `rows`; drop the payload
    // after a day while keeping the run itself in the audit trail.
    await this.db
      .update(syncRuns)
      .set({ rows: null, parseErrors: null })
      .where(
        and(eq(syncRuns.status, 'previewed'), lt(syncRuns.startedAt, dayAgo)),
      );
    // A customer run's diff names people, so it goes after a day, applied or
    // not, or a deleted account outlives itself here (NFR-LEGAL-12). The run
    // and its counts stay.
    await this.db
      .update(syncRuns)
      .set({ rows: null, parseErrors: null, plan: null })
      .where(
        and(
          eq(syncRuns.area, 'customers'),
          lt(syncRuns.startedAt, dayAgo),
          or(
            isNotNull(syncRuns.rows),
            isNotNull(syncRuns.parseErrors),
            isNotNull(syncRuns.plan),
          ),
        ),
      );
  }
}

/** A stored run as the contract describes it, the same for every area. */
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

/** The run without the person: a client polling its run is not owed the
 * address of the admin who discarded it. */
export function toMachineSyncRun(run: SyncRun): MachineSyncRun {
  const { actorEmail: _person, ...rest } = run;
  return rest;
}
