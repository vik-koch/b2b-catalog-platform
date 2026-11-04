import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { and, count, desc, eq } from 'drizzle-orm';
import { Pagination } from '@b2b-catalog-platform/shared/platform';
import {
  CatalogSyncPlan,
  CustomerSyncPlan,
  OrderSyncPlan,
  SYNC_RUNS_PAGE_SIZE,
  SyncArea,
  SyncCommitResponse,
  SyncRun,
  SyncRunStatus,
} from '@b2b-catalog-platform/shared/core/exchange';
import { DRIZZLE } from '../../platform/db/database.module';
import * as schema from '../../platform/db/schema';
import { syncRuns } from '../../platform/db/schema';
import { CatalogSyncService } from '../../core/exchange/catalog-sync.service';
import { CustomerSyncService } from '../../core/exchange/customer-sync.service';
import {
  Actor,
  CONFLICT_CODE,
  runNotFound,
} from '../../core/exchange/sync-run';
import { toSyncRun } from '../../core/exchange/sync-run-log';
import { stagedPayload } from '../../core/exchange/sync-run-payload';

/** Refuses a reader the run's area is not open to; called before any work. */
export type AreaCheck = (area: SyncArea) => void;

/**
 * A run of any area: its page, the log, and the decisions on a staged one.
 * Holds no differ: an area's own engine is asked where one is needed.
 */
@Injectable()
export class SyncService {
  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof schema>,
    private readonly catalog: CatalogSyncService,
    private readonly customers: CustomerSyncService,
  ) {}

  /** Applies a staged run through its own area's engine. */
  async commit(
    id: string,
    actor: Actor,
    check: AreaCheck,
  ): Promise<SyncCommitResponse> {
    const area = await this.areaOf(id);
    check(area);
    switch (area) {
      case 'customers':
        return this.customers.commit(id, actor);
      case 'catalog':
        return this.catalog.commit(id, actor);
      // An order run is applied as it arrives, so it is never staged.
      case 'orders':
        throw new ConflictException({
          code: CONFLICT_CODE['applied'],
          message: 'An order run is applied when it arrives',
        });
    }
  }

  /** The row stays, marked discarded: a preview nobody applied is part of
   * the record. */
  async discard(
    id: string,
    actor: Actor,
    check: AreaCheck,
  ): Promise<{ run: SyncRun }> {
    return this.db.transaction(async (tx) => {
      const [run] = await tx
        .select()
        .from(syncRuns)
        .where(eq(syncRuns.id, id))
        .for('update');
      if (!run) throw runNotFound();
      check(run.area);
      if (run.status !== 'previewed') {
        throw new ConflictException({
          code: CONFLICT_CODE[run.status],
          message: `This run is ${run.status} and cannot be discarded`,
        });
      }

      const [updated] = await tx
        .update(syncRuns)
        .set({
          status: 'discarded',
          finishedAt: new Date(),
          actorId: actor.id,
          actorEmail: actor.email,
          rows: null,
          parseErrors: null,
        })
        .where(eq(syncRuns.id, id))
        .returning();
      return { run: toSyncRun(updated) };
    });
  }

  /** A staged run's plan is recomputed, since it must describe what would
   * happen now; a finished run shows the plan it stored. */
  async getRun(
    id: string,
    check: AreaCheck,
  ): Promise<{
    run: SyncRun;
    plan: CatalogSyncPlan | CustomerSyncPlan | OrderSyncPlan | null;
  }> {
    const [run] = await this.db
      .select()
      .from(syncRuns)
      .where(eq(syncRuns.id, id));
    if (!run) throw runNotFound();
    check(run.area);

    const staged = stagedPayload(run);
    if (!staged) {
      return { run: toSyncRun(run), plan: run.plan ?? null };
    }
    switch (staged.area) {
      case 'customers':
        return {
          run: toSyncRun(run),
          plan: await this.customers.replan(staged),
        };
      case 'catalog':
        return { run: toSyncRun(run), plan: await this.catalog.replan(staged) };
    }
  }

  /** One area's log; never a mix, which a reader of one area could not read. */
  async listRuns(
    page: number,
    area: SyncArea,
    status?: SyncRunStatus,
  ): Promise<{
    runs: SyncRun[];
    pagination: Pagination;
    lastApplied: SyncRun | null;
  }> {
    const inArea = eq(syncRuns.area, area);
    const filter = status ? and(inArea, eq(syncRuns.status, status)) : inArea;
    const [[{ value: total }], rows, [applied]] = await Promise.all([
      this.db.select({ value: count() }).from(syncRuns).where(filter),
      this.db
        .select()
        .from(syncRuns)
        .where(filter)
        .orderBy(desc(syncRuns.seq))
        .limit(SYNC_RUNS_PAGE_SIZE)
        .offset((page - 1) * SYNC_RUNS_PAGE_SIZE),
      // By finish, not insertion: a run staged earlier and applied later is
      // the latest applied.
      this.db
        .select()
        .from(syncRuns)
        .where(and(inArea, eq(syncRuns.status, 'applied')))
        .orderBy(desc(syncRuns.finishedAt))
        .limit(1),
    ]);

    return {
      runs: rows.map(toSyncRun),
      pagination: {
        page,
        pageSize: SYNC_RUNS_PAGE_SIZE,
        total: Number(total),
        totalPages: Math.ceil(Number(total) / SYNC_RUNS_PAGE_SIZE),
      },
      lastApplied: applied ? toSyncRun(applied) : null,
    };
  }

  private async areaOf(id: string): Promise<SyncArea> {
    const [row] = await this.db
      .select({ area: syncRuns.area })
      .from(syncRuns)
      .where(eq(syncRuns.id, id));
    if (!row) throw runNotFound();
    return row.area;
  }
}
