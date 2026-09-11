import {
  ConflictException,
  HttpException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { and, count, desc, eq, inArray, isNull, lt, sql } from 'drizzle-orm';
import {
  decideAutoApply,
  Pagination,
  SYNC_RUNS_PAGE_SIZE,
  SyncCommitResponse,
  SyncFailureReport,
  SyncOptions,
  SyncPlan,
  SyncPolicy,
  SyncPreviewResponse,
  SyncRow,
  SyncRun,
  SyncRunStatus,
  SyncSubmission,
  SyncSubmitResponse,
  slugify,
  syncOptionsSchema,
} from '@b2b-catalog-platform/shared';
import { DRIZZLE } from '../db/database.module';
import { SettingsService } from '../settings/settings.service';
import {
  catalogExternallyOwned,
  catalogNotExternallyOwned,
} from '../settings/ownership.refusals';
import * as schema from '../db/schema';
import {
  categories,
  customerTiers,
  productPrices,
  products,
  syncRuns,
} from '../db/schema';
import { SyncActions, SyncCatalogState, planSync } from './sync-diff';
import { SyncNotifications } from './sync-notifications';
import {
  LOW_STOCK_THRESHOLD_PIECES,
  SYNC_POLICY,
} from '../config/deployment-config';

/** The transaction handle Drizzle hands a `db.transaction` callback. */
type Tx = Parameters<
  Parameters<NodePgDatabase<typeof schema>['transaction']>[0]
>[0];

/** Anything that can read the catalog: the pool, or a transaction on it. */
type Reader = Pick<NodePgDatabase<typeof schema>, 'select'>;

/** Staged rows and finished runs are audit data, not archive data. */
const RUN_RETENTION_DAYS = 90;

/** The one 404 here; a function so each throw gets its own stack. */
const runNotFound = () =>
  new NotFoundException({
    code: 'run-not-found',
    message: 'Sync run not found',
  });

interface Actor {
  id: string;
  email: string;
}

/** The automated client behind a headless run. Never an `Actor`: there is no
 * person here, and nothing that reads one should be able to read this. */
interface Submitter {
  id: string;
  name: string;
}

/**
 * Why a run that is not `previewed` cannot be acted on. One sentence each,
 * rather than one code carrying the status: "already done", "it went wrong",
 * "a newer one replaced it" and "you said no to it" are four different things
 * for an admin to read.
 */
const CONFLICT_CODE: Record<Exclude<SyncRunStatus, 'previewed'>, string> = {
  applied: 'run-already-applied',
  failed: 'run-failed',
  'no-change': 'run-no-change',
  superseded: 'run-superseded',
  discarded: 'run-discarded',
};

/**
 * Whether a run has anything in it at all.
 *
 * Skipped rows count as something. A run whose diff is empty because the file
 * could not be read is the opposite of a quiet night, and burying it as "no
 * change" would hide the one thing the log exists to show.
 */
function isNoChange(plan: SyncPlan): boolean {
  const s = plan.summary;
  return (
    s.create +
      s.update +
      s.softDelete +
      s.restore +
      s.categoriesCreated +
      s.categoriesRenamed +
      s.errors ===
    0
  );
}

/**
 * The sync engine. Preview and commit share one differ (`planSync`);
 * the difference is that a preview stages its rows and writes
 * nothing, while a commit re-diffs those rows against freshly read state and
 * applies the result in a single transaction — so a partially imported catalog
 * is not a state this can reach.
 *
 * A headless run (FR-ADM-07) is the same two halves in one request rather than
 * a second importer: it stages exactly as an upload does, and then either
 * applies itself or waits, depending on what the diff turned out to say.
 */
@Injectable()
export class SyncService {
  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof schema>,
    // Handed to the differ, which resolves the stored availability itself.
    @Inject(LOW_STOCK_THRESHOLD_PIECES)
    private readonly lowStockFallback: number,
    // What this deployment lets an unattended run do to itself.
    @Inject(SYNC_POLICY)
    private readonly policy: SyncPolicy,
    private readonly settings: SettingsService,
    private readonly notifications: SyncNotifications,
  ) {}

  /** Whether the exchange currently holds the pen (FR-ADM-10). */
  private get catalogIsOwned(): boolean {
    return this.settings.isExternallyOwned('catalog');
  }

  /** Parse-free entry point: rows are already validated (CSV or JSON). */
  async preview(
    rows: SyncRow[],
    options: SyncOptions,
    filename: string | null,
    actor: Actor,
    parseErrors: SyncPlan['rowErrors'] = [],
  ): Promise<SyncPreviewResponse> {
    // The manual upload is the operator's fallback, and it is closed exactly
    // while somebody else is doing the job (FR-ADM-02). Refused here rather
    // than only in the controller so the rule holds for every caller.
    if (this.catalogIsOwned) throw catalogExternallyOwned('upload');
    const state = await this.readState();
    const { plan } = planSync(rows, options, state, parseErrors);

    // Nothing to decide: the run is recorded as it stands and stages no rows,
    // rather than waiting in a queue for somebody to press a button that is
    // not even on the screen.
    const nothingToDo = isNoChange(plan);

    await this.prune();
    const [row] = await this.db
      .insert(syncRuns)
      .values({
        status: nothingToDo ? 'no-change' : 'previewed',
        finishedAt: nothingToDo ? new Date() : null,
        source: 'upload',
        filename,
        actorId: actor.id,
        actorEmail: actor.email,
        options,
        summary: plan.summary,
        rows: nothingToDo ? null : rows,
        parseErrors: nothingToDo ? null : parseErrors,
        plan: nothingToDo ? plan : null,
      })
      .returning();

    return { run: toSyncRun(row), plan };
  }

  /**
   * Apply a previewed run: one transaction from claiming the run to marking it
   * applied, so the catalog and the run's own record cannot disagree.
   *
   * The run row is read `for update`, which is what claims it. Two admins
   * pressing apply on the same run would otherwise both read `previewed` and
   * both commit the plan; the second now waits, re-reads the status the first
   * wrote, and is refused. And because the run is marked in the same
   * transaction as the catalog write, a crash between them cannot leave a run
   * still saying `previewed` over a catalog that has already moved.
   */
  async commit(id: string, actor: Actor): Promise<SyncCommitResponse> {
    const { run, applied } = await this.applyRun(id, actor);
    return { run, applied };
  }

  /**
   * The commit itself, with or without a person behind it. `actor` is null for
   * a run that applied itself: the run already records the token that
   * submitted it, and naming an admin who was not there would be a worse lie
   * than an empty column.
   */
  private async applyRun(
    id: string,
    actor: Actor | null,
  ): Promise<SyncCommitResponse & { plan: SyncPlan }> {
    try {
      return await this.db.transaction(async (tx) => {
        const [run] = await tx
          .select()
          .from(syncRuns)
          .where(eq(syncRuns.id, id))
          .for('update');
        if (!run) throw runNotFound();
        if (run.status !== 'previewed') {
          throw new ConflictException({
            code: CONFLICT_CODE[run.status],
            message: `This run is ${run.status} and cannot be applied`,
          });
        }
        if (!run.rows || !run.options) {
          throw new ConflictException({
            code: 'run-rows-pruned',
            message: 'This run’s staged rows have been pruned',
          });
        }
        // Applying is the write, so it is judged by the setting in force now
        // rather than the one in force when the file went up: a run uploaded
        // before the catalog was handed over is not a way to get a manual
        // write in afterwards. Machine runs are unaffected — they exist only
        // while the catalog *is* owned, which is when applying them is right.
        if (run.source === 'upload' && this.catalogIsOwned) {
          throw catalogExternallyOwned('apply an uploaded run');
        }

        // Re-diff against current state: the catalog may have moved since the
        // preview (another admin edited a product), so the preview is advisory
        // and this computation is the authoritative one. Read through the
        // transaction, so what is planned is what is written.
        const state = await this.readState(tx);
        const { plan, actions } = planSync(
          run.rows,
          run.options,
          state,
          run.parseErrors ?? [],
        );

        await this.apply(tx, actions, state);

        const [updated] = await tx
          .update(syncRuns)
          .set({
            status: 'applied',
            finishedAt: new Date(),
            summary: plan.summary,
            ...(actor ? { actorId: actor.id, actorEmail: actor.email } : {}),
            // The staged input has served its purpose. What replaces it is the
            // diff rather than the counts: "which products moved last night" is
            // the question this log exists to answer, and a run nobody watched
            // is exactly the one nobody saw the preview of.
            rows: null,
            parseErrors: null,
            plan,
          })
          .where(eq(syncRuns.id, id))
          .returning();

        return { run: toSyncRun(updated), applied: plan.summary, plan };
      });
    } catch (error) {
      // A refusal is not a failed run: the run is untouched and still
      // previewed, and saying otherwise would retire a run nobody applied.
      if (error instanceof HttpException) throw error;
      // Anything else rolled the catalog back with it, so the run is recorded
      // as failed in a write of its own — inside the transaction it would have
      // been rolled back too.
      const message = error instanceof Error ? error.message : String(error);
      await this.db
        .update(syncRuns)
        .set({ status: 'failed', finishedAt: new Date(), error: message })
        .where(eq(syncRuns.id, id));
      throw error;
    }
  }

  /**
   * The headless run (FR-ADM-07): stage it, then let the policy decide whether
   * it applies itself.
   *
   * It is staged first and unconditionally, so a run exists in the log before
   * anything is written and whatever happens next has a row to happen to. The
   * decision is made on the diff — what the run would *do* — rather than on
   * what it declared it might touch: a field whitelist states an intent, a diff
   * states an effect, and only the second is worth a person's attention.
   */
  async submit(
    submission: SyncSubmission,
    submitter: Submitter,
  ): Promise<SyncSubmitResponse> {
    // The other half of the mutual exclusion: nobody has handed the catalog
    // over, so the shop is writing it by hand and a second writer is refused.
    if (!this.catalogIsOwned) throw catalogNotExternallyOwned();
    // Absent options mean the schema's defaults, exactly as they do for an
    // upload — parsed rather than assumed, so the delete gate is applied to a
    // headless run's intent as well.
    const options = syncOptionsSchema.parse(submission.options ?? {});
    const state = await this.readState();
    const { plan } = planSync(submission.rows, options, state);

    // A run with nothing in it is never staged and never applied — not even
    // when the caller asked to be doubted, because doubt about a parse that
    // produced no change is still nothing for a person to decide.
    const nothingToDo = isNoChange(plan);
    const stagedReason = nothingToDo
      ? null
      : decideAutoApply(
          plan.summary,
          state.products.filter((product) => !product.deletedAt).length,
          this.policy,
          submission.requestReview,
        );

    await this.prune();
    // Where the feed stood before this run, read before anything is written:
    // inserting supersedes the staged run this one overtakes, so asked
    // afterwards the question would answer itself.
    const previous = await this.previousMachineStatus();
    await this.supersedeStaged();
    const [row] = await this.db
      .insert(syncRuns)
      .values({
        status: nothingToDo ? 'no-change' : 'previewed',
        finishedAt: nothingToDo ? new Date() : null,
        source: 'api',
        filename: submission.label ?? null,
        tokenId: submitter.id,
        tokenName: submitter.name,
        stagedReason,
        options,
        summary: plan.summary,
        rows: nothingToDo ? null : submission.rows,
        plan: nothingToDo ? plan : null,
      })
      .returning();

    if (nothingToDo || stagedReason) {
      const run = toSyncRun(row);
      await this.notifications.announce(run, previous);
      return { run, plan };
    }

    // The applying half re-diffs against state read inside its own
    // transaction, so what it computed — not what was planned a moment ago —
    // is what the caller is told about.
    const applied = await this.applyRun(row.id, null);
    await this.notifications.announce(applied.run, previous);
    return { run: applied.run, plan: applied.plan };
  }

  /**
   * A breakage the caller could not turn into a run. Recorded as a failed run
   * of its own, because the alternative is silence — and a feed that has
   * stopped working looks exactly like a feed with nothing to send.
   *
   * The row carries no options and no summary: nothing was ever intended and
   * nothing was ever counted. The message is the caller's own text, kept
   * verbatim for a person to read, like the exception text beside it.
   */
  async reportFailure(
    report: SyncFailureReport,
    submitter: Submitter,
  ): Promise<{ run: SyncRun }> {
    // Refused for the same reason a submission is. It costs the record of a
    // feed that is still broken while an operator has taken the catalog back —
    // which is the right trade: they took it back *because* it is broken, and
    // a client told plainly that the platform is not listening is better than
    // one quietly filling a log nobody asked it to write.
    if (!this.catalogIsOwned) throw catalogNotExternallyOwned();
    const previous = await this.previousMachineStatus();
    const now = new Date();
    const [row] = await this.db
      .insert(syncRuns)
      .values({
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
    const run = toSyncRun(row);
    await this.notifications.announce(run, previous);
    return { run };
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

  async getRun(id: string): Promise<{ run: SyncRun; plan: SyncPlan | null }> {
    const [run] = await this.db
      .select()
      .from(syncRuns)
      .where(eq(syncRuns.id, id));
    if (!run) throw runNotFound();

    // A staged run recomputes its diff, because the catalog may have moved
    // since it was taken and a preview has to describe what would happen now.
    // A finished one shows the diff it stored — that one is history and must
    // not be recomputed. A run that failed before it had either shows nothing.
    if (!run.rows || !run.options) {
      return { run: toSyncRun(run), plan: run.plan ?? null };
    }
    const state = await this.readState();
    const { plan } = planSync(
      run.rows,
      run.options,
      state,
      run.parseErrors ?? [],
    );
    return { run: toSyncRun(run), plan };
  }

  async listRuns(
    page: number,
    status?: SyncRunStatus,
  ): Promise<{
    runs: SyncRun[];
    pagination: Pagination;
    lastApplied: SyncRun | null;
  }> {
    const filter = status ? eq(syncRuns.status, status) : undefined;
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
      .where(eq(syncRuns.status, 'applied'))
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

  // --- Internals ---------------------------------------------------------

  /**
   * The whole catalog, in two queries. A few hundred products and a few dozen
   * categories fit in memory comfortably (the same reasoning that keeps the
   * category tree in the app rather than in recursive SQL, ADR 0022), and it
   * lets the differ stay pure.
   */
  private async readState(db: Reader = this.db): Promise<SyncCatalogState> {
    const [productRows, categoryRows, tierRows, priceRows] = await Promise.all([
      db
        .select({
          id: products.id,
          sourceId: products.sourceId,
          slug: products.slug,
          name: products.name,

          priceMinor: products.defaultPriceMinor,
          categoryId: products.categoryId,
          deletedAt: products.deletedAt,
          // Read for the availability recompute: a figure alone does not say
          // which state it lands in.
          stockPieces: products.stockPieces,
          piecesPerPack: products.piecesPerPack,
          packsPerBox: products.packsPerBox,
          lowStockThresholdPieces: products.lowStockThresholdPieces,
        })
        .from(products),
      db
        .select({
          id: categories.id,
          sourceId: categories.sourceId,
          slug: categories.slug,
          name: categories.name,
        })
        .from(categories),
      db
        .select({ id: customerTiers.id, key: customerTiers.key })
        .from(customerTiers),
      // Every override in the catalog. A tier carries only its exceptions, so
      // this table is far smaller than the product list it belongs to.
      db
        .select({
          productId: productPrices.productId,
          tierId: productPrices.tierId,
          priceMinor: productPrices.priceMinor,
        })
        .from(productPrices),
    ]);

    const tierKeyById = new Map(tierRows.map((t) => [t.id, t.key]));
    const pricesByProduct = new Map<string, Record<string, number>>();
    for (const price of priceRows) {
      const key = tierKeyById.get(price.tierId);
      if (!key) continue;
      const forProduct = pricesByProduct.get(price.productId) ?? {};
      forProduct[key] = price.priceMinor;
      pricesByProduct.set(price.productId, forProduct);
    }

    return {
      products: productRows.map((p) => ({
        ...p,
        tierPrices: pricesByProduct.get(p.id) ?? {},
      })),
      categories: categoryRows,
      tiers: tierRows,
      lowStockFallback: this.lowStockFallback,
    };
  }

  /**
   * Applies a plan, in the caller's transaction. Categories first, because
   * products created in the same run may reference them.
   */
  private async apply(
    tx: Tx,
    actions: SyncActions,
    state: SyncCatalogState,
  ): Promise<void> {
    // Slugs are allocated in memory against the slugs already in use, so a run
    // creating hundreds of products does not do a uniqueness query per row.
    const takenProductSlugs = new Set(state.products.map((p) => p.slug));
    const takenCategorySlugs = new Set(state.categories.map((c) => c.slug));

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

    /**
     * Upsert, never delete: a run writes the price lists its file carries and
     * leaves every other list where it was. Clearing an override is an admin
     * action in the product editor, not something a partial export does by
     * omission.
     */
    const writeTierPrices = async (
      productId: string,
      entries: { tierId: string; priceMinor: number }[],
    ) => {
      if (entries.length === 0) return;
      await tx
        .insert(productPrices)
        .values(entries.map((e) => ({ productId, ...e })))
        .onConflictDoUpdate({
          target: [productPrices.productId, productPrices.tierId],
          set: {
            priceMinor: sql`excluded."priceMinor"`,
            updatedAt: new Date(),
          },
        });
    };

    for (const product of actions.createProducts) {
      const categoryId = resolveCategory(
        product.categoryId,
        product.categorySourceId,
      );
      const [created] = await tx
        .insert(products)
        // No `publishedAt`: an imported product carries a price whose basis
        // nobody has set yet, so it waits for an admin (FR-ADM-06). An update
        // leaves it alone, so a re-sync never hides a live product.
        .values({
          sourceId: product.sourceId,
          slug: allocateSlug(product.name, 'product', takenProductSlugs),
          name: product.name,
          defaultPriceMinor: product.priceMinor,
          categoryId: categoryId as string,
          // Both or neither: the state is the figure's shadow, and the check
          // constraint on the table says so.
          ...(product.stockPieces === undefined
            ? {}
            : {
                stockPieces: product.stockPieces,
                availability: product.availability,
              }),
        })
        .returning({ id: products.id });
      await writeTierPrices(created.id, product.tierPrices);
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
            ? { defaultPriceMinor: update.priceMinor }
            : {}),
          ...(categoryId !== undefined ? { categoryId } : {}),
          ...(update.stockPieces === undefined
            ? {}
            : {
                stockPieces: update.stockPieces,
                availability: update.availability,
              }),
          updatedAt: new Date(),
        })
        .where(eq(products.id, update.id));
      await writeTierPrices(update.id, update.tierPrices ?? []);
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
  }

  /**
   * Retires whatever headless run is still staged, because this one replaces
   * it.
   *
   * A staged run is a snapshot of a diff that was true when it was taken. Two
   * hour-old previews from a quarter-hourly feed are not a backlog to work
   * through, they are noise, and only the newest is worth applying. An admin's
   * own upload is left alone: it is theirs, and nothing a machine sends
   * supersedes a decision a person is in the middle of.
   */
  /**
   * The status of the automated run before this one, or null where there has
   * never been one. Uploads are left out: a person previewing their own file
   * is not the feed's state, and it is their screen that answers them.
   */
  private async previousMachineStatus(): Promise<SyncRunStatus | null> {
    const [row] = await this.db
      .select({ status: syncRuns.status })
      .from(syncRuns)
      .where(eq(syncRuns.source, 'api'))
      .orderBy(desc(syncRuns.startedAt))
      .limit(1);
    return row?.status ?? null;
  }

  private async supersedeStaged(): Promise<void> {
    await this.db
      .update(syncRuns)
      .set({
        status: 'superseded',
        finishedAt: new Date(),
        rows: null,
        parseErrors: null,
      })
      .where(and(eq(syncRuns.status, 'previewed'), eq(syncRuns.source, 'api')));
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
    tokenName: row.tokenName,
    stagedReason: row.stagedReason,
    options: row.options,
    summary: row.summary,
    error: row.error,
  };
}
