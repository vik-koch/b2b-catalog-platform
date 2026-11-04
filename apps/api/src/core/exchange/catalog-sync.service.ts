import {
  ConflictException,
  HttpException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq, inArray, isNull, sql } from 'drizzle-orm';
import { slugify } from '@b2b-catalog-platform/shared/core/catalog';
import {
  decideAutoApply,
  SyncFailureReport,
  CatalogSyncOptions,
  CatalogSyncPlan,
  SyncPolicy,
  CatalogSyncPreviewResponse,
  CatalogSyncRow,
  SyncRun,
  CatalogSyncSubmission,
  CatalogSyncSubmitResponse,
  catalogSyncOptionsSchema,
  SyncCommitResponse,
} from '@b2b-catalog-platform/shared/core/exchange';
import { DRIZZLE } from '../../platform/db/database.module';
import { OwnershipState } from '../../platform/settings/ownership-state';
import {
  catalogExternallyOwned,
  catalogNotExternallyOwned,
} from '../../platform/settings/ownership.refusals';
import * as schema from '../../platform/db/schema';
import {
  categories,
  customerTiers,
  productPrices,
  products,
  syncRuns,
} from '../../platform/db/schema';
import { excluded } from '../../platform/db/sql-columns';
import { SyncActions, SyncCatalogState, planSync } from './sync-diff';
import { StagedPayloadOf, stagedPayload } from './sync-run-payload';
import {
  Actor,
  CONFLICT_CODE,
  Reader,
  Submitter,
  Tx,
  runNotFound,
} from './sync-run';
import { SyncRunLog, toSyncRun } from './sync-run-log';
import { SyncNotifications } from './sync-notifications';
import {
  LOW_STOCK_THRESHOLD_PIECES,
  SYNC_POLICY,
} from '../../platform/config/deployment-config';

/** Skipped rows count as something: an unreadable file is not a quiet
 * night. */
function isNoChange(plan: CatalogSyncPlan): boolean {
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
 * The catalog exchange (FR-ADM-02, FR-ADM-07). A preview stages its rows and
 * writes nothing; a commit re-diffs them against fresh state and applies the
 * result in one transaction. A headless run is both halves in one request,
 * applying itself or waiting by what the diff says.
 */
@Injectable()
export class CatalogSyncService {
  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof schema>,
    @Inject(LOW_STOCK_THRESHOLD_PIECES)
    private readonly lowStockFallback: number,
    @Inject(SYNC_POLICY)
    private readonly policy: SyncPolicy,
    private readonly ownership: OwnershipState,
    private readonly notifications: SyncNotifications,
    private readonly log: SyncRunLog,
  ) {}

  private get catalogIsOwned(): boolean {
    return this.ownership.isExternallyOwned('catalog');
  }

  /** Rows arrive validated, from CSV or JSON. */
  async preview(
    rows: CatalogSyncRow[],
    options: CatalogSyncOptions,
    filename: string | null,
    actor: Actor,
    parseErrors: CatalogSyncPlan['rowErrors'] = [],
  ): Promise<CatalogSyncPreviewResponse> {
    // The upload is closed while another system owns the catalog (FR-ADM-02).
    if (this.catalogIsOwned) throw catalogExternallyOwned('upload');
    const state = await this.readState();
    const { plan } = planSync(rows, options, state, parseErrors);

    // Nothing to decide: recorded as it stands, staging nothing.
    const nothingToDo = isNoChange(plan);

    await this.log.prune();
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

  /** A staged run, applied by a person. */
  async commit(id: string, actor: Actor): Promise<SyncCommitResponse> {
    const { run, applied } = await this.applyRun(id, actor);
    return { run, applied };
  }

  /** A staged run's diff against the catalog now: what its page shows, since
   * whoever applies it must see what would happen now. */
  async replan(staged: StagedPayloadOf<'catalog'>): Promise<CatalogSyncPlan> {
    const state = await this.readState();
    return planSync(staged.rows, staged.options, state, staged.parseErrors)
      .plan;
  }

  /** `actor` is null for a run that applied itself: the run names its token,
   * and no admin was there. */
  private async applyRun(
    id: string,
    actor: Actor | null,
  ): Promise<SyncCommitResponse & { plan: CatalogSyncPlan }> {
    try {
      return await this.db.transaction(async (tx) => {
        const [run] = await tx
          .select()
          .from(syncRuns)
          .where(eq(syncRuns.id, id))
          .for('update');
        if (!run) throw runNotFound();
        if (run.area !== 'catalog') throw runNotFound();
        if (run.status !== 'previewed') {
          throw new ConflictException({
            code: CONFLICT_CODE[run.status],
            message: `This run is ${run.status} and cannot be applied`,
          });
        }
        const staged = stagedPayload(run);
        if (!staged) {
          throw new ConflictException({
            code: 'run-rows-pruned',
            message: 'This run’s staged rows have been pruned',
          });
        }
        // Narrows the payload; the compiler cannot carry the check above.
        if (staged.area !== 'catalog') throw runNotFound();
        // Judged by the setting now, not at upload: an upload staged before
        // the hand-over is no way to write by hand afterwards.
        if (run.source === 'upload' && this.catalogIsOwned) {
          throw catalogExternallyOwned('apply an uploaded run');
        }

        // Through the transaction, so what is planned is what is written.
        const state = await this.readState(tx);
        const { plan, actions } = planSync(
          staged.rows,
          staged.options,
          state,
          staged.parseErrors,
        );

        await this.apply(tx, actions, state);

        const [updated] = await tx
          .update(syncRuns)
          .set({
            status: 'applied',
            finishedAt: new Date(),
            summary: plan.summary,
            ...(actor ? { actorId: actor.id, actorEmail: actor.email } : {}),
            // The diff replaces the input: "what moved last night" is what the
            // log is read for.
            rows: null,
            parseErrors: null,
            plan,
          })
          .where(eq(syncRuns.id, id))
          .returning();

        return { run: toSyncRun(updated), applied: plan.summary, plan };
      });
    } catch (error) {
      // A refusal leaves the run previewed; it did not fail.
      if (error instanceof HttpException) throw error;
      // Recorded outside the rolled-back transaction, or it would roll back
      // too.
      const message = error instanceof Error ? error.message : String(error);
      await this.db
        .update(syncRuns)
        .set({ status: 'failed', finishedAt: new Date(), error: message })
        .where(eq(syncRuns.id, id));
      throw error;
    }
  }

  /** The headless run (FR-ADM-07): always staged first, so the log has a
   * row before anything is written; the policy then judges the diff, not the
   * fields the run declared. */
  async submit(
    submission: CatalogSyncSubmission,
    submitter: Submitter,
  ): Promise<CatalogSyncSubmitResponse> {
    if (!this.catalogIsOwned) throw catalogNotExternallyOwned();
    // Parsed, so the defaults and the delete gate apply as for an upload.
    const options = catalogSyncOptionsSchema.parse(submission.options ?? {});
    const state = await this.readState();
    const { plan } = planSync(submission.rows, options, state);

    // Never staged, even when review was requested: nothing to decide.
    const nothingToDo = isNoChange(plan);
    const stagedReason = nothingToDo
      ? null
      : decideAutoApply(
          plan.summary,
          state.products.filter((product) => !product.deletedAt).length,
          this.policy,
          submission.requestReview,
        );

    await this.log.prune();
    const previous = await this.log.previousMachineStatus('catalog');
    await this.log.supersedeStaged('catalog');
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
        notice: submission.notice ?? null,
      })
      .returning();

    if (nothingToDo || stagedReason) {
      const run = toSyncRun(row);
      await this.notifications.announce(run, previous);
      return { run, plan };
    }

    // The caller is told what the apply computed, not the plan above.
    const applied = await this.applyRun(row.id, null);
    await this.notifications.announce(applied.run, previous);
    return { run: applied.run, plan: applied.plan };
  }

  async reportFailure(
    report: SyncFailureReport,
    submitter: Submitter,
  ): Promise<{ run: SyncRun }> {
    // Refused like a submission: a catalog taken back is not listening.
    if (!this.catalogIsOwned) throw catalogNotExternallyOwned();
    const { run, previous } = await this.log.recordFailure(
      'catalog',
      report,
      submitter,
    );
    await this.notifications.announce(run, previous);
    return { run };
  }

  /** The whole catalog in memory, which a few thousand products fit, so the
   * differ stays pure. */
  private async readState(db: Reader = this.db): Promise<SyncCatalogState> {
    const [productRows, categoryRows, tierRows, priceRows] = await Promise.all([
      db
        .select({
          id: products.id,
          sourceId: products.sourceId,
          slug: products.slug,
          name: products.name,
          categoryId: products.categoryId,
          deletedAt: products.deletedAt,
          deletedBy: products.deletedBy,
          stockPieces: products.stockPieces,
          taxRate: products.taxRate,
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
        .select({
          id: customerTiers.id,
          key: customerTiers.key,
          isDefault: customerTiers.isDefault,
        })
        .from(customerTiers),
      // A tier carries only its exceptions, so this is about one row a
      // product.
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

  /** In the caller's transaction; categories first, as new products may
   * reference them. */
  private async apply(
    tx: Tx,
    actions: SyncActions,
    state: SyncCatalogState,
  ): Promise<void> {
    // In memory, rather than a uniqueness query per created row.
    const takenProductSlugs = new Set(state.products.map((p) => p.slug));
    const takenCategorySlugs = new Set(state.categories.map((c) => c.slug));

    // Unparented: the export has no hierarchy, an admin places them.
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

    // A rename keeps the slug, so links hold, and the tree position.
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

    /** Upsert, never delete: clearing an override is the product editor's,
     * not a partial export's. */
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
            priceMinor: excluded(productPrices.priceMinor),
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
        // Unpublished: an imported product waits for an admin (FR-ADM-06).
        .values({
          sourceId: product.sourceId,
          slug: allocateSlug(product.name, 'product', takenProductSlugs),
          name: product.name,
          categoryId: categoryId as string,
          // Both or neither, as the table's check constraint requires.
          ...(product.stockPieces === undefined
            ? {}
            : {
                stockPieces: product.stockPieces,
                availability: product.availability,
              }),
          ...(product.taxRate === undefined
            ? {}
            : { taxRate: product.taxRate }),
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
          ...(categoryId !== undefined ? { categoryId } : {}),
          ...(update.stockPieces === undefined
            ? {}
            : {
                stockPieces: update.stockPieces,
                availability: update.availability,
              }),
          ...(update.taxRate === undefined ? {} : { taxRate: update.taxRate }),
          updatedAt: new Date(),
        })
        .where(eq(products.id, update.id));
      await writeTierPrices(update.id, update.tierPrices ?? []);
    }

    // Unsigned: a null `deletedBy` marks a run's deletion, the only kind a
    // run restores.
    if (actions.softDeleteProductIds.length > 0) {
      await tx
        .update(products)
        .set({ deletedAt: new Date(), deletedBy: null, updatedAt: new Date() })
        .where(inArray(products.id, actions.softDeleteProductIds));
    }
    if (actions.restoreProductIds.length > 0) {
      await tx
        .update(products)
        .set({ deletedAt: null, deletedBy: null, updatedAt: new Date() })
        .where(inArray(products.id, actions.restoreProductIds));
    }
  }
}

/** The admin editor's slug rule, against the slugs taken so far, this run's
 * included. */
function allocateSlug(name: string, stem: string, taken: Set<string>): string {
  const base = slugify(name) || stem;
  let candidate = base;
  for (let i = 2; taken.has(candidate); i++) {
    candidate = `${base}-${i}`;
  }
  taken.add(candidate);
  return candidate;
}
