import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { and, count, desc, eq, inArray, isNull, lt, sql } from 'drizzle-orm';
import {
  SYNC_RUNS_PAGE_SIZE,
  SyncCommitResponse,
  SyncOptions,
  SyncPlan,
  SyncPreviewResponse,
  SyncRow,
  SyncRun,
  slugify,
} from '@b2b-catalog-platform/shared';
import { DRIZZLE } from '../db/database.module';
import * as schema from '../db/schema';
import { categories, products, syncRuns } from '../db/schema';
import { SyncActions, SyncCatalogState, planSync } from './sync-diff';

/** Staged rows and finished runs are audit data, not archive data. */
const RUN_RETENTION_DAYS = 90;

interface Actor {
  id: string;
  email: string;
}

/**
 * The sync engine. Preview and commit share one differ (`planSync`);
 * the difference is that a preview stages its rows and writes
 * nothing, while a commit re-diffs those rows against freshly read state and
 * applies the result in a single transaction — so a partially imported catalog
 * is not a state this can reach.
 */
@Injectable()
export class SyncService {
  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  /** Parse-free entry point: rows are already validated (CSV or JSON). */
  async preview(
    rows: SyncRow[],
    options: SyncOptions,
    filename: string | null,
    actor: Actor,
    parseErrors: SyncPlan['rowErrors'] = [],
  ): Promise<SyncPreviewResponse> {
    const state = await this.readState();
    const { plan } = planSync(rows, options, state, parseErrors);

    await this.prune();
    const [row] = await this.db
      .insert(syncRuns)
      .values({
        status: 'previewed',
        source: 'upload',
        filename,
        actorId: actor.id,
        actorEmail: actor.email,
        options,
        summary: plan.summary,
        rows,
        parseErrors,
      })
      .returning();

    return { run: toSyncRun(row), plan };
  }

  async commit(id: string, actor: Actor): Promise<SyncCommitResponse> {
    const [run] = await this.db
      .select()
      .from(syncRuns)
      .where(eq(syncRuns.id, id));
    if (!run) throw new NotFoundException('Sync run not found');
    if (run.status !== 'previewed') {
      throw new ConflictException(
        `This run is already ${run.status} and cannot be applied again`,
      );
    }
    if (!run.rows) {
      throw new ConflictException(
        'This run’s staged rows have been pruned; upload the file again',
      );
    }

    // Re-diff against current state: the catalog may have moved since the
    // preview (another admin edited a product), so the preview is advisory and
    // this computation is the authoritative one.
    const state = await this.readState();
    const { plan, actions } = planSync(
      run.rows,
      run.options,
      state,
      run.parseErrors ?? [],
    );

    try {
      await this.apply(actions, state);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.db
        .update(syncRuns)
        .set({ status: 'failed', finishedAt: new Date(), error: message })
        .where(eq(syncRuns.id, id));
      throw error;
    }

    const [updated] = await this.db
      .update(syncRuns)
      .set({
        status: 'applied',
        finishedAt: new Date(),
        summary: plan.summary,
        actorId: actor.id,
        actorEmail: actor.email,
        // The staged input has served its purpose; the summary is the record.
        rows: null,
        parseErrors: null,
      })
      .where(eq(syncRuns.id, id))
      .returning();

    return { run: toSyncRun(updated), applied: plan.summary };
  }

  async getRun(id: string): Promise<{ run: SyncRun; plan: SyncPlan | null }> {
    const [run] = await this.db
      .select()
      .from(syncRuns)
      .where(eq(syncRuns.id, id));
    if (!run) throw new NotFoundException('Sync run not found');

    // A previewed run can still show its diff (its rows are staged); a finished
    // one has only its summary, which is what the audit trail needs.
    if (!run.rows) return { run: toSyncRun(run), plan: null };
    const state = await this.readState();
    const { plan } = planSync(
      run.rows,
      run.options,
      state,
      run.parseErrors ?? [],
    );
    return { run: toSyncRun(run), plan };
  }

  async listRuns(page: number): Promise<{
    runs: SyncRun[];
    total: number;
    lastApplied: SyncRun | null;
  }> {
    const [{ value: total }] = await this.db
      .select({ value: count() })
      .from(syncRuns);
    const rows = await this.db
      .select()
      .from(syncRuns)
      .orderBy(desc(syncRuns.startedAt))
      .limit(SYNC_RUNS_PAGE_SIZE)
      .offset((page - 1) * SYNC_RUNS_PAGE_SIZE);
    const [applied] = await this.db
      .select()
      .from(syncRuns)
      .where(eq(syncRuns.status, 'applied'))
      .orderBy(desc(syncRuns.finishedAt))
      .limit(1);

    return {
      runs: rows.map(toSyncRun),
      total: Number(total),
      lastApplied: applied ? toSyncRun(applied) : null,
    };
  }

  // --- Internals ---------------------------------------------------------

  /**
   * The whole catalog, in two queries. A few hundred products and a few dozen
   * categories fit in memory comfortably (the same reasoning that keeps the
   * category tree in the app rather than in recursive SQL, ADR 0022), and it
   * lets the differ stay pure.
   */
  private async readState(): Promise<SyncCatalogState> {
    const [productRows, categoryRows] = await Promise.all([
      this.db
        .select({
          id: products.id,
          sourceId: products.sourceId,
          slug: products.slug,
          name: products.name,
          priceMinor: products.priceMinor,
          categoryId: products.categoryId,
          deletedAt: products.deletedAt,
        })
        .from(products),
      this.db
        .select({
          id: categories.id,
          sourceId: categories.sourceId,
          slug: categories.slug,
          name: categories.name,
        })
        .from(categories),
    ]);
    return { products: productRows, categories: categoryRows };
  }

  /**
   * Applies a plan in one transaction. Categories first, because products
   * created in the same run may reference them.
   */
  private async apply(
    actions: SyncActions,
    state: SyncCatalogState,
  ): Promise<void> {
    // Slugs are allocated in memory against the slugs already in use, so a run
    // creating hundreds of products does not do a uniqueness query per row.
    const takenProductSlugs = new Set(state.products.map((p) => p.slug));
    const takenCategorySlugs = new Set(state.categories.map((c) => c.slug));

    await this.db.transaction(async (tx) => {
      // New categories are created unparented — the export carries no
      // hierarchy, so an admin places them in the tree afterwards.
      const createdCategoryIds = new Map<string, string>();
      if (actions.createCategories.length > 0) {
        const [{ value: maxRootOrder }] = await tx
          .select({
            value: sql<number>`coalesce(max(${categories.sortOrder}), -1)`,
          })
          .from(categories)
          .where(isNull(categories.parentId));
        let sortOrder = Number(maxRootOrder) + 1;

        for (const category of actions.createCategories) {
          const [row] = await tx
            .insert(categories)
            .values({
              sourceId: category.sourceId,
              slug: allocateSlug(category.name, 'category', takenCategorySlugs),
              name: category.name,
              parentId: null,
              sortOrder: sortOrder++,
            })
            .returning({ id: categories.id });
          createdCategoryIds.set(category.sourceId, row.id);
        }
      }

      // A rename keeps the slug (a changed URL breaks links) and the tree
      // position — only the display name moves.
      for (const category of actions.updateCategories) {
        await tx
          .update(categories)
          .set({ name: category.name, updatedAt: new Date() })
          .where(eq(categories.id, category.id));
      }

      const resolveCategory = (
        categoryId: string | null | undefined,
        categorySourceId: string | null | undefined,
      ): string | undefined => {
        if (categoryId) return categoryId;
        if (categorySourceId) {
          const created = createdCategoryIds.get(categorySourceId);
          if (!created) {
            throw new Error(
              `Category "${categorySourceId}" was planned but not created`,
            );
          }
          return created;
        }
        return undefined;
      };

      for (const product of actions.createProducts) {
        const categoryId = resolveCategory(
          product.categoryId,
          product.categorySourceId,
        );
        await tx.insert(products).values({
          sourceId: product.sourceId,
          slug: allocateSlug(product.name, 'product', takenProductSlugs),
          name: product.name,
          priceMinor: product.priceMinor,
          categoryId: categoryId as string,
        });
      }

      for (const update of actions.updateProducts) {
        const categoryId = resolveCategory(
          update.categoryId,
          update.categorySourceId,
        );
        await tx
          .update(products)
          .set({
            ...(update.name !== undefined ? { name: update.name } : {}),
            ...(update.priceMinor !== undefined
              ? { priceMinor: update.priceMinor }
              : {}),
            ...(categoryId !== undefined ? { categoryId } : {}),
            updatedAt: new Date(),
          })
          .where(eq(products.id, update.id));
      }

      // Slug stays fixed across a rename (a changed URL breaks links), so
      // nothing here touches it — see ADR 0022.
      if (actions.softDeleteProductIds.length > 0) {
        await tx
          .update(products)
          .set({ deletedAt: new Date(), updatedAt: new Date() })
          .where(inArray(products.id, actions.softDeleteProductIds));
      }
      if (actions.restoreProductIds.length > 0) {
        await tx
          .update(products)
          .set({ deletedAt: null, updatedAt: new Date() })
          .where(inArray(products.id, actions.restoreProductIds));
      }
    });
  }

  /** Drops staged rows and whole runs past the retention window. */
  private async prune(): Promise<void> {
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

/**
 * A unique slug for a newly imported row, allocated against the slugs already
 * taken (including the ones this run just allocated). Mirrors the admin
 * editor's rule — transliterate the name, disambiguate with a numeric suffix.
 */
function allocateSlug(name: string, stem: string, taken: Set<string>): string {
  const base = slugify(name) || stem;
  let candidate = base;
  for (let i = 2; taken.has(candidate); i++) {
    candidate = `${base}-${i}`;
  }
  taken.add(candidate);
  return candidate;
}

function toSyncRun(row: typeof syncRuns.$inferSelect): SyncRun {
  return {
    id: row.id,
    status: row.status,
    source: row.source,
    filename: row.filename,
    startedAt: row.startedAt.toISOString(),
    finishedAt: row.finishedAt ? row.finishedAt.toISOString() : null,
    actorEmail: row.actorEmail,
    options: row.options,
    summary: row.summary,
    error: row.error,
  };
}
