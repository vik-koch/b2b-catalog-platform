import {
  DEFAULT_PRICE_LIST_ALIAS,
  MANUAL_SOURCE_ID_PREFIX,
  ProductAvailability,
  productAvailability,
  SYNC_CSV_COLUMNS,
  SYNC_FIELDS,
  SYNC_PREVIEW_MAX_ITEMS,
  SyncOptions,
  SyncPlan,
  SyncProductChange,
  SyncRow,
  SyncRowError,
  SyncSummary,
  syncPriceColumn,
} from '@b2b-catalog-platform/shared';

/**
 * The differ: rows + intent + current catalog → what would change. Pure, so the
 * interesting rules (what a run may write, what may be deleted, how categories
 * are matched) are unit-testable without a database, and so preview and commit
 * can run exactly the same computation — commit re-runs it against freshly read
 * state rather than trusting the preview.
 */

/** The slice of the catalog the differ needs. */
export interface SyncCatalogState {
  products: ExistingProduct[];
  categories: ExistingCategory[];
  /** The deployment's additional price lists. The base list is not among them:
   * it is a column, addressed by the reserved `default` key. */
  tiers: ExistingTier[];
  /**
   * The deployment's own "few left" figure — the last rung of the ladder, for
   * a product with neither a box nor a pack. Deployment config rather than
   * catalog, but the differ has to be told it: it resolves the stored
   * availability itself, so that preview and commit agree on the badge the way
   * they already agree on everything else.
   */
  lowStockFallback: number;
}

export interface ExistingTier {
  id: string;
  key: string;
  /** The list guests are charged, and the one a bare `price` column means. */
  isDefault: boolean;
}

export interface ExistingProduct {
  id: string;
  sourceId: string;
  slug: string;
  name: string;
  /** Current prices by tier key — every list that prices this product, the
   * default one included. An absent key means that list charges the default
   * list's price; a product absent from *every* list has no price at all and
   * cannot be published. */
  tierPrices: Record<string, number>;
  categoryId: string;
  deletedAt: Date | null;
  /** Null where this product's stock is not tracked. */
  stockPieces: number | null;
  /** What the resolved state depends on besides the figure: the packaging the
   * threshold is measured in, and the product's own override of it. */
  piecesPerPack: number | null;
  packsPerBox: number | null;
  lowStockThresholdPieces: number | null;
}

export interface ExistingCategory {
  id: string;
  sourceId: string;
  slug: string;
  name: string;
}

/** What the applier executes. Kept separate from the presentational `SyncPlan`
 * so the UI shape can change without touching the write path. */
export interface SyncActions {
  createCategories: { sourceId: string; name: string }[];
  /** Categories the file renames. Identity is the source id, so a renamed
   * category is updated in place rather than created anew. */
  updateCategories: { id: string; name: string }[];
  createProducts: {
    sourceId: string;
    name: string;
    /** Resolved at apply time: an existing id, or a category this run creates. */
    categoryId: string | null;
    categorySourceId: string | null;
    tierPrices: TierPriceWrite[];
    /** Absent where the file carries no figure; the two travel together, so a
     * row cannot leave a state without the count behind it. */
    stockPieces?: number;
    availability?: ProductAvailability;
  }[];
  updateProducts: {
    id: string;
    name?: string;
    categoryId?: string | null;
    categorySourceId?: string | null;
    /**
     * Prices to write, **upsert only**. A sync writes the lists its file
     * carries and leaves the others alone — the same "absent is not empty"
     * rule the rest of a row follows, and the reason this differs from the
     * product editor, where the posted set is the whole truth.
     */
    tierPrices?: TierPriceWrite[];
    /** Recomputed here rather than in the applier: the threshold follows the
     * product's packaging, which the differ has already read. */
    stockPieces?: number;
    availability?: ProductAvailability;
  }[];
  softDeleteProductIds: string[];
  restoreProductIds: string[];
}

/** One tier's price for one product, resolved to the tier's id. */
export interface TierPriceWrite {
  tierId: string;
  priceMinor: number;
}

export interface SyncPlanResult {
  plan: SyncPlan;
  actions: SyncActions;
}

/**
 * A category's identity is its `categorySourceId`, so a name is free to change
 * — but two rows claiming the same id under *different* names contradict each
 * other. Comparing normalized names keeps the incidental differences a
 * hand-maintained source produces (surrounding space, repeated space, case)
 * from being read as a contradiction.
 */
export function normalizeCategoryName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * A row's prices keyed by the list they name, with the bare `price` column's
 * alias resolved to the badged list's key and every key matched
 * case-insensitively against the ones this deployment has.
 *
 * Matched here rather than in the parser because only the database knows the
 * keys, and matched in TypeScript rather than by a `lower()` index because
 * Postgres folds case by collation and a JavaScript engine folds it by the
 * Unicode default — one rule, applied once, in one place.
 */
function resolvePriceKeys(
  row: SyncRow,
  tiers: ExistingTier[],
): { prices: Record<string, number>; unknownKey?: string } {
  const byFolded = new Map(tiers.map((t) => [fold(t.key), t.key]));
  const defaultKey = tiers.find((t) => t.isDefault)?.key;
  const prices: Record<string, number> = {};
  for (const [written, priceMinor] of Object.entries(row.prices ?? {})) {
    const key =
      written === DEFAULT_PRICE_LIST_ALIAS
        ? defaultKey
        : byFolded.get(fold(written));
    if (key === undefined) return { prices, unknownKey: written };
    prices[key] = priceMinor as number;
  }
  return { prices };
}

/** One spelling of a key, for comparison only — never for storage or display. */
function fold(key: string): string {
  return key.normalize('NFC').toLowerCase();
}

export function planSync(
  rows: SyncRow[],
  options: SyncOptions,
  state: SyncCatalogState,
  parseErrors: SyncRowError[] = [],
): SyncPlanResult {
  const writesName = options.fields.includes('name');
  const writesCategory = options.fields.includes('category');
  const writesStock = options.fields.includes('stock');

  const productsBySourceId = new Map(
    state.products.map((p) => [p.sourceId, p]),
  );

  const categoriesBySourceId = new Map(
    state.categories.map((c) => [c.sourceId, c]),
  );

  // Price-list keys are validated here rather than in the contract: they are
  // rows, not code, so only the database knows which exist.
  const tierIdByKey = new Map(state.tiers.map((t) => [t.key, t.id]));
  const knownPriceListKeys = state.tiers.map((t) => t.key);
  const defaultTierKey = state.tiers.find((t) => t.isDefault)?.key;

  const rowErrors: SyncRowError[] = [...parseErrors];
  const productChanges: SyncProductChange[] = [];
  const actions: SyncActions = {
    createCategories: [],
    updateCategories: [],
    createProducts: [],
    updateProducts: [],
    softDeleteProductIds: [],
    restoreProductIds: [],
  };

  // Categories this run would create, and how many rows land in each.
  const newCategories = new Map<string, { name: string; count: number }>();
  // Categories the file renames, keyed by source id.
  const renamedCategories = new Map<
    string,
    { id: string; from: string; name: string; count: number }
  >();
  // The name each source id claimed the first time it appeared in this file,
  // so a later row contradicting it can be caught.
  const claimedNames = new Map<string, string>();
  // Post-run live product count per existing category id, to spot emptied ones.
  const liveCountByCategory = new Map<string, number>();
  for (const product of state.products) {
    if (!product.deletedAt) {
      liveCountByCategory.set(
        product.categoryId,
        (liveCountByCategory.get(product.categoryId) ?? 0) + 1,
      );
    }
  }
  const countDelta = (categoryId: string, delta: number) =>
    liveCountByCategory.set(
      categoryId,
      (liveCountByCategory.get(categoryId) ?? 0) + delta,
    );

  /** A row's prices, resolved to tier ids. */
  const tierPricesOf = (prices: Record<string, number>): TierPriceWrite[] =>
    Object.entries(prices).map(([key, priceMinor]) => ({
      tierId: tierIdByKey.get(key) as string,
      priceMinor,
    }));

  let unchanged = 0;
  const seenSourceIds = new Set<string>();

  for (const [index, row] of rows.entries()) {
    const rowNumber = index + 1;
    seenSourceIds.add(row.sourceId);
    const existing = productsBySourceId.get(row.sourceId);

    // A price for a list this deployment does not have is a converter bug, not
    // something to guess at: the row is skipped and the message names the keys
    // that would have worked, the same treatment an unknown category gets.
    const { prices, unknownKey } = resolvePriceKeys(row, state.tiers);
    if (unknownKey !== undefined) {
      rowErrors.push({
        row: rowNumber,
        sourceId: row.sourceId,
        code: 'unknown-price-list',
        params: {
          key: unknownKey,
          known: knownPriceListKeys.map((k) => `"${k}"`).join(', '),
        },
      });
      continue;
    }

    // Resolve the row's category first: an unresolvable one fails the row
    // before anything else is decided about it.
    let categoryId: string | null | undefined;
    let categorySourceId: string | null | undefined;
    // The contract guarantees the two category fields travel together.
    if (row.categorySourceId !== undefined && writesCategory) {
      const key = row.categorySourceId;
      const name = row.categoryName as string;

      // One id, one name — a file disagreeing with itself cannot say which
      // name it means, so the row is an error rather than a coin flip.
      const claimed = claimedNames.get(key);
      if (claimed !== undefined) {
        if (normalizeCategoryName(claimed) !== normalizeCategoryName(name)) {
          rowErrors.push({
            row: rowNumber,
            sourceId: row.sourceId,
            code: 'category-name-conflict',
            params: { key, first: claimed, second: name },
          });
          continue;
        }
      } else {
        claimedNames.set(key, name);
      }

      const existingCategory = categoriesBySourceId.get(key);
      if (existingCategory !== undefined) {
        categoryId = existingCategory.id;
        // A renamed category is updated in place: identity is the source id,
        // so a new name is a rename, never a second category.
        if (name !== existingCategory.name) {
          const pending = renamedCategories.get(key);
          if (pending) pending.count += 1;
          else
            renamedCategories.set(key, {
              id: existingCategory.id,
              from: existingCategory.name,
              name,
              count: 1,
            });
        }
      } else if (options.createCategories) {
        categoryId = null;
        categorySourceId = key;
        const pending = newCategories.get(key);
        if (pending) pending.count += 1;
        else newCategories.set(key, { name, count: 1 });
      } else {
        rowErrors.push({
          row: rowNumber,
          sourceId: row.sourceId,
          code: 'unknown-category',
          params: { name, key },
        });
        continue;
      }
    }

    if (!existing) {
      if (!options.createMissing) {
        unchanged += 1;
        continue;
      }
      // A new product needs the fields the read model cannot default: a name
      // and a category. A price is not among them — a source that exports
      // products and prices in separate files creates the product first, and
      // it simply waits unpublished until a list prices it (FR-ADM-06).
      const name = writesName ? row.name : undefined;
      if (!name || categoryId === undefined) {
        rowErrors.push({
          row: rowNumber,
          sourceId: row.sourceId,
          code: 'cannot-create-product',
        });
        continue;
      }
      const stock = writesStock ? row.stockPieces : undefined;
      actions.createProducts.push({
        sourceId: row.sourceId,
        name,
        categoryId,
        categorySourceId: categorySourceId ?? null,
        tierPrices: tierPricesOf(prices),
        ...(stock === undefined
          ? {}
          : {
              stockPieces: stock,
              // A new product has no packaging yet — nobody has entered it —
              // so its threshold is the deployment's own figure.
              availability: productAvailability(
                stock,
                { piecesPerPack: null, packsPerBox: null },
                null,
                state.lowStockFallback,
              ) as ProductAvailability,
            }),
      });
      productChanges.push({
        kind: 'create',
        sourceId: row.sourceId,
        name,
        slug: null,
        changes: [],
      });
      if (categoryId) countDelta(categoryId, 1);
      continue;
    }

    if (!options.updateExisting) {
      unchanged += 1;
      continue;
    }

    const changes: SyncProductChange['changes'] = [];
    const update: SyncActions['updateProducts'][number] = { id: existing.id };

    if (writesName && row.name !== undefined && row.name !== existing.name) {
      changes.push({ field: 'name', from: existing.name, to: row.name });
      update.name = row.name;
    }

    // Each list the file carries, against what that list charges today. A tier
    // with no price of its own falls back to the default list's, so that is
    // what the diff shows it moving *from* — the number the customer sees now,
    // not a blank. Null where nothing prices the product yet.
    const tierWrites = tierPricesOf(prices).filter((write) => {
      const key = state.tiers.find((t) => t.id === write.tierId)?.key as string;
      const fallback =
        defaultTierKey === undefined
          ? undefined
          : existing.tierPrices[defaultTierKey];
      const current = existing.tierPrices[key] ?? fallback ?? null;
      if (current === write.priceMinor && key in existing.tierPrices) {
        return false;
      }
      // A price equal to the default list's is still worth writing: it pins
      // that tier against a later change to the default list.
      changes.push({
        field: syncPriceColumn(key),
        from: current,
        to: write.priceMinor,
      });
      return true;
    });
    if (tierWrites.length > 0) update.tierPrices = tierWrites;

    if (categoryId !== undefined && categoryId !== existing.categoryId) {
      const fromCategory = state.categories.find(
        (c) => c.id === existing.categoryId,
      );
      changes.push({
        field: 'category',
        from: fromCategory?.name ?? null,
        to: row.categoryName ?? null,
      });
      update.categoryId = categoryId;
      update.categorySourceId = categorySourceId ?? null;
      if (!existing.deletedAt) {
        countDelta(existing.categoryId, -1);
        if (categoryId) countDelta(categoryId, 1);
      }
    }

    // Recomputed against this product's own packaging and override, which is
    // why the differ reads them: the same figure means "few left" for a product
    // boxed in 24s and "in stock" for one sold loose. Written only when the
    // file carries a figure — an absent cell leaves both columns alone.
    if (writesStock && row.stockPieces !== undefined) {
      const stock = row.stockPieces;
      if (stock !== existing.stockPieces) {
        changes.push({
          field: 'stock',
          from: existing.stockPieces,
          to: stock,
        });
        update.stockPieces = stock;
        update.availability = productAvailability(
          stock,
          existing,
          existing.lowStockThresholdPieces,
          state.lowStockFallback,
        ) as ProductAvailability;
      }
    }

    // A product returning to the file is restored — the inverse of the delete
    // sweep, and the reason a soft delete is reversible in the first place.
    const restoring = Boolean(existing.deletedAt) && options.restoreReturning;
    if (restoring) {
      actions.restoreProductIds.push(existing.id);
      productChanges.push({
        kind: 'restore',
        sourceId: existing.sourceId,
        name: update.name ?? existing.name,
        slug: existing.slug,
        changes,
      });
      countDelta(update.categoryId ?? existing.categoryId, 1);
      if (changes.length > 0) actions.updateProducts.push(update);
      continue;
    }

    if (changes.length === 0) {
      unchanged += 1;
      continue;
    }
    actions.updateProducts.push(update);
    productChanges.push({
      kind: 'update',
      sourceId: existing.sourceId,
      name: update.name ?? existing.name,
      slug: existing.slug,
      changes,
    });
  }

  // The delete sweep. Gated on authority over the product set, and blind to
  // `manual:` products, which are absent from every real export by
  // construction and would otherwise be wiped on the first authoritative run.
  const keptManual: { sourceId: string; name: string }[] = [];
  if (options.softDeleteMissingProducts && options.productSetAuthoritative) {
    for (const product of state.products) {
      if (product.deletedAt || seenSourceIds.has(product.sourceId)) continue;
      if (product.sourceId.startsWith(MANUAL_SOURCE_ID_PREFIX)) {
        keptManual.push({ sourceId: product.sourceId, name: product.name });
        continue;
      }
      actions.softDeleteProductIds.push(product.id);
      productChanges.push({
        kind: 'softDelete',
        sourceId: product.sourceId,
        name: product.name,
        slug: product.slug,
        changes: [],
      });
      countDelta(product.categoryId, -1);
    }
  }

  // Categories the run empties. Reported only — a sync never deletes a
  // category (every top-level one is absent from every file by construction).
  const emptiedCategories = state.categories
    .filter((category) => {
      const before = state.products.some(
        (p) => !p.deletedAt && p.categoryId === category.id,
      );
      return before && (liveCountByCategory.get(category.id) ?? 0) <= 0;
    })
    .map((category) => ({ slug: category.slug, name: category.name }));

  for (const [sourceId, { name }] of newCategories) {
    actions.createCategories.push({ sourceId, name });
  }
  for (const { id, name } of renamedCategories.values()) {
    actions.updateCategories.push({ id, name });
  }

  const summary: SyncSummary = {
    rows: rows.length,
    create: actions.createProducts.length,
    update: productChanges.filter((c) => c.kind === 'update').length,
    softDelete: actions.softDeleteProductIds.length,
    restore: actions.restoreProductIds.length,
    unchanged,
    categoriesCreated: actions.createCategories.length,
    categoriesRenamed: actions.updateCategories.length,
    keptManual: keptManual.length,
    errors: rowErrors.length,
    fields: fieldsWritten(productChanges, defaultTierKey),
  };

  const categoryChanges = [
    ...[...newCategories.values()].map(({ name, count }) => ({
      kind: 'create' as const,
      name,
      from: null,
      productCount: count,
    })),
    ...[...renamedCategories.values()].map(({ from, name, count }) => ({
      kind: 'rename' as const,
      name,
      from,
      productCount: count,
    })),
  ];

  // Lists are capped so a first import stays a response rather than a download;
  // the summary above counts everything regardless.
  const cap = <T>(items: T[]) => items.slice(0, SYNC_PREVIEW_MAX_ITEMS);
  const truncated = [
    productChanges,
    categoryChanges,
    emptiedCategories,
    keptManual,
    rowErrors,
  ].some((list) => list.length > SYNC_PREVIEW_MAX_ITEMS);

  return {
    actions,
    plan: {
      summary,
      products: cap(productChanges),
      categories: cap(categoryChanges),
      emptiedCategories: cap(emptiedCategories),
      keptManual: cap(keptManual),
      rowErrors: cap(rowErrors),
      truncated,
    },
  };
}

/**
 * Which fields a run rewrites, in a fixed order so two runs that touch the same
 * things read the same. Taken from the changes themselves rather than from the
 * run's declared `fields`: what a run is *allowed* to write and what it turned
 * out to write are different sentences, and the log is about the second.
 */
function fieldsWritten(
  changes: SyncProductChange[],
  defaultTierKey: string | undefined,
): string[] {
  const seen = new Set<string>();
  for (const change of changes) {
    for (const field of change.changes) seen.add(field.field);
  }
  const ordered = SYNC_FIELDS.filter((field) => seen.has(field));
  // Price lists after the plain fields, and the default list before the rest:
  // that is the order they are read in everywhere else.
  const defaultColumn =
    defaultTierKey === undefined ? null : syncPriceColumn(defaultTierKey);
  const prices = [...seen]
    .filter((field) => field.startsWith(SYNC_CSV_COLUMNS.pricePrefix))
    .sort((a, b) =>
      a === defaultColumn ? -1 : b === defaultColumn ? 1 : a.localeCompare(b),
    );
  return [...ordered, ...prices];
}
