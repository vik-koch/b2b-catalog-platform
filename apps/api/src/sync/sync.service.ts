import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { and, count, desc, eq } from 'drizzle-orm';
import {
  Pagination,
  SYNC_RUNS_PAGE_SIZE,
  SyncArea,
  SyncCommitResponse,
  CustomerSyncPlan,
  SyncPlan,
  SyncRun,
  SyncRunStatus,
} from '@b2b-catalog-platform/shared';
import { DRIZZLE } from '../db/database.module';
import * as schema from '../db/schema';
import { syncRuns } from '../db/schema';
import { stagedPayload } from './sync-run-payload';
import { Actor, CONFLICT_CODE, runNotFound } from './sync-run';
import { CatalogSyncService } from './catalog-sync.service';
import { CustomerSyncService } from './customer-sync.service';
import { toSyncRun } from './sync-run-log';

/**
 * A run, whatever it carries: which area it belongs to, what its page shows,
 * what the log reads like, and the two decisions a person makes on a staged
 * one (ADR 0060).
 *
 * Area-blind by construction — it holds no differ and writes nothing an area
 * owns. Where an area's own engine is needed it is asked, and the arrow points
 * one way only: an engine never reaches back here.
 */
@Injectable()
export class SyncService {
  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof schema>,
    private readonly catalog: CatalogSyncService,
    private readonly customers: CustomerSyncService,
  ) {}

  /**
   * Apply a previewed run, through the engine of the area it belongs to. The
   * area is read here rather than in the controller because it is a property
   * of the run and not of the request: one route serves them all, and the id
   * is what says which.
   */
  async commit(id: string, actor: Actor): Promise<SyncCommitResponse> {
    switch (await this.areaOf(id)) {
      case 'customers':
        return this.customers.commit(id, actor);
      case 'catalog':
        return this.catalog.commit(id, actor);
    }
  }

  /** Which area a run belongs to, or a 404 where there is no such run. The
   * cheapest read of a run there is — the controller asks it to decide whether
   * this reader may act at all, before anything recomputes a diff. */
  async areaOf(id: string): Promise<SyncArea> {
    const [row] = await this.db
      .select({ area: syncRuns.area })
      .from(syncRuns)
      .where(eq(syncRuns.id, id));
    if (!row) throw runNotFound();
    return row.area;
  }

  /**
   * An admin deciding against a staged run. The row stays, marked as the
   * decision it was: a preview nobody applied is part of the record, and a
   * queue that can only be cleared by the next run arriving is a queue nobody
   * reads.
   */
  async discard(id: string, actor: Actor): Promise<{ run: SyncRun }> {
    return this.db.transaction(async (tx) => {
      const [run] = await tx
        .select()
        .from(syncRuns)
        .where(eq(syncRuns.id, id))
        .for('update');
      if (!run) throw runNotFound();
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

  async getRun(
    id: string,
  ): Promise<{ run: SyncRun; plan: SyncPlan | CustomerSyncPlan | null }> {
    const [run] = await this.db
      .select()
      .from(syncRuns)
      .where(eq(syncRuns.id, id));
    if (!run) throw runNotFound();

    // A staged run recomputes its diff, because the world may have moved since
    // it was taken and a preview has to describe what would happen now. A
    // finished one shows the diff it stored — that one is history and must not
    // be recomputed. A run that failed before it had either shows nothing.
    const staged = stagedPayload(run);
    if (!staged) {
      return { run: toSyncRun(run), plan: run.plan ?? null };
    }
    // Which differ recomputes it is the run's own area. This one method serves
    // every area, because a run id is unique across them and a link to a
    // staged run has to work for whoever was asked to answer it (ADR 0060).
    // Each arm is handed rows already narrowed to the shape its engine works
    // in.
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

  /**
   * One area's log. The area is a filter and never a default here: every
   * screen asks about one area, and a list mixing them would be unreadable by
   * whoever may read only one of them (FR-ADM-09).
   */
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
    const [{ value: total }] = await this.db
      .select({ value: count() })
      .from(syncRuns)
      .where(filter);
    const rows = await this.db
      .select()
      .from(syncRuns)
      .where(filter)
      .orderBy(desc(syncRuns.startedAt))
      .limit(SYNC_RUNS_PAGE_SIZE)
      .offset((page - 1) * SYNC_RUNS_PAGE_SIZE);
    const [applied] = await this.db
      .select()
      .from(syncRuns)
      .where(and(inArea, eq(syncRuns.status, 'applied')))
      .orderBy(desc(syncRuns.finishedAt))
      .limit(1);

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
}
