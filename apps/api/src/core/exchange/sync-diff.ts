/**
 * The catalog differ: rows, intent and the current catalog in, what would
 * change out. Pure, so commit can rerun it against fresh state rather than
 * trust the preview.
 */
import {
  ProductAvailability,
  productAvailability,
} from '@b2b-catalog-platform/shared/core/catalog';
import {
  CATALOG_SYNC_CSV_COLUMNS,
  CATALOG_SYNC_FIELDS,
  CatalogSyncOptions,
  CatalogSyncPlan,
  CatalogSyncProductChange,
  CatalogSyncRow,
  CatalogSyncRowError,
  DEFAULT_PRICE_LIST_ALIAS,
  MANUAL_SOURCE_ID_PREFIX,
  SYNC_PREVIEW_MAX_ITEMS,
  syncPriceColumn,
  SyncSummary,
} from '@b2b-catalog-platform/shared/core/exchange';

/** The slice of the catalog the differ needs. */
export interface SyncCatalogState {
  products: ExistingProduct[];
  categories: ExistingCategory[];
  /** Every price list, the default one included. */
  tiers: ExistingTier[];
  /** The deployment's "few left" figure for a product with no packaging: the
   * differ resolves availability itself, so preview and commit agree on it. */
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
  /** Prices by tier key. An absent key charges the default list's price. */
  tierPrices: Record<string, number>;
  categoryId: string;
  deletedAt: Date | null;
  /** Null when a run deleted it: a run restores only its own deletions
   * (FR-ADM-02). */
  deletedBy: string | null;
  /** Null where this product's stock is not tracked. */
  stockPieces: number | null;
  /** Null where it is taxed at the deployment's default. */
  taxRate: number | null;
  /** The packaging the threshold is measured in, and the product's override. */
  piecesPerPack: number | null;
  packsPerBox: number | null;
  lowStockThresholdPieces: number | null;
}

export interface ExistingCategory {
  id: string;
  /** Null for a category the shop made: no run touches it, it is here only
   * for the emptied-category report. */
  sourceId: string | null;
  slug: string;
  name: string;
}

/** What the applier executes, apart from the plan a screen shows. */
export interface SyncActions {
  createCategories: { sourceId: string; name: string }[];
  /** Renamed in place: a category's identity is its source id. */
  updateCategories: { id: string; name: string }[];
  createProducts: {
    sourceId: string;
    name: string;
    /** Resolved at apply time: an existing id, or a category this run creates. */
    categoryId: string | null;
    categorySourceId: string | null;
    tierPrices: TierPriceWrite[];
    /** Absent where the file has no figure; always set together. */
    stockPieces?: number;
    availability?: ProductAvailability;
    /** Absent where the file says nothing; null is the default rate. */
    taxRate?: number | null;
  }[];
  updateProducts: {
    id: string;
    name?: string;
    categoryId?: string | null;
    categorySourceId?: string | null;
    /** Upsert only: lists the file leaves out are kept, unlike the product
     * editor, where the posted set is the whole truth. */
    tierPrices?: TierPriceWrite[];
    stockPieces?: number;
    availability?: ProductAvailability;
    taxRate?: number | null;
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
  plan: CatalogSyncPlan;
  actions: SyncActions;
}

/** Two rows naming one category id differently contradict each other; space
 * and case differences from a hand-kept source do not count. */
export function normalizeCategoryName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * A row's prices by tier key: the bare `price` alias becomes the default
 * list's key, and keys match case-insensitively. Folded here, not by a
 * `lower()` index, as Postgres folds by collation and JavaScript by Unicode.
 */
function resolvePriceKeys(
  row: CatalogSyncRow,
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

/** For comparison only, never for storage or display. */
function fold(key: string): string {
  return key.normalize('NFC').toLowerCase();
}

export function planSync(
  rows: CatalogSyncRow[],
  options: CatalogSyncOptions,
  state: SyncCatalogState,
  parseErrors: CatalogSyncRowError[] = [],
): SyncPlanResult {
  const writesName = options.fields.includes('name');
  const writesCategory = options.fields.includes('category');
  const writesStock = options.fields.includes('stock');
  const writesTaxRate = options.fields.includes('taxRate');

  const productsBySourceId = new Map(
    state.products.map((p) => [p.sourceId, p]),
  );

  const categoriesBySourceId = new Map(
    state.categories
      .filter((c) => c.sourceId !== null)
      .map((c) => [c.sourceId as string, c]),
  );

  // Validated here, not in the contract: only the database knows the keys.
  const tierIdByKey = new Map(state.tiers.map((t) => [t.key, t.id]));
  const tierKeyById = new Map(state.tiers.map((t) => [t.id, t.key]));
  const knownPriceListKeys = state.tiers.map((t) => t.key);
  const defaultTierKey = state.tiers.find((t) => t.isDefault)?.key;

  const rowErrors: CatalogSyncRowError[] = [...parseErrors];
  const productChanges: CatalogSyncProductChange[] = [];
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

    // An unknown list is a converter bug: skip the row and name the keys.
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

    // "Not priced" is an absent column, so a zero is a converter bug, not a
    // free product.
    const zeroKey = Object.entries(prices).find(
      ([, priceMinor]) => priceMinor === 0,
    )?.[0];
    if (zeroKey !== undefined) {
      rowErrors.push({
        row: rowNumber,
        sourceId: row.sourceId,
        code: 'price-is-zero',
        params: { column: syncPriceColumn(zeroKey) },
      });
      continue;
    }

    // An unresolvable category fails the row before anything else.
    let categoryId: string | null | undefined;
    let categorySourceId: string | null | undefined;
    // The contract guarantees the two category fields travel together.
    if (row.categorySourceId !== undefined && writesCategory) {
      const key = row.categorySourceId;
      const name = row.categoryName as string;

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
      // A name and a category, not a price: a source with a separate price
      // file creates the product first, and it waits unpublished (FR-ADM-06).
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
      // Null is what a new product has anyway, so only a rate is worth writing.
      const taxRate = writesTaxRate ? row.taxRate : undefined;
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
              // No packaging yet, so the deployment's own threshold.
              availability: productAvailability(
                stock,
                { piecesPerPack: null, packsPerBox: null },
                null,
                state.lowStockFallback,
              ) as ProductAvailability,
            }),
        ...(taxRate == null ? {} : { taxRate }),
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

    const changes: CatalogSyncProductChange['changes'] = [];
    const update: SyncActions['updateProducts'][number] = { id: existing.id };

    if (writesName && row.name !== undefined && row.name !== existing.name) {
      changes.push({ field: 'name', from: existing.name, to: row.name });
      update.name = row.name;
    }

    // A tier with no price of its own moves *from* the default list's price:
    // the number its customers see now.
    const fallback =
      defaultTierKey === undefined
        ? undefined
        : existing.tierPrices[defaultTierKey];
    const tierWrites = tierPricesOf(prices).filter((write) => {
      const key = tierKeyById.get(write.tierId) as string;
      const current = existing.tierPrices[key] ?? fallback ?? null;
      if (current === write.priceMinor && key in existing.tierPrices) {
        return false;
      }
      // Equal to the default list's is still written: it pins the tier.
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

    // Against the product's own packaging: one figure is "few left" boxed in
    // 24s and "in stock" sold loose.
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

    // Null is the default rate, a value; only absent is skipped.
    if (
      writesTaxRate &&
      row.taxRate !== undefined &&
      row.taxRate !== existing.taxRate
    ) {
      changes.push({
        field: 'taxRate',
        from: existing.taxRate,
        to: row.taxRate,
      });
      update.taxRate = row.taxRate;
    }

    // Restores only the sweep's own deletions: an admin's is the shop's
    // decision, and the file does not overrule it.
    const restoring =
      Boolean(existing.deletedAt) &&
      existing.deletedBy === null &&
      options.restoreReturning;
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

  // The delete sweep skips `manual:` products: no export ever carries them.
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

  // Reported only: a sync never deletes a category.
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
    categoriesEmptied: emptiedCategories.length,
    keptManual: keptManual.length,
    // Customer-run counts: a catalog run mails and claims no one.
    mailed: 0,
    claimed: 0,
    claimedById: 0,
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

  // Capped so a first import stays a response; the summary counts all.
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

/** The fields the run actually changed (not the ones it may write), in a
 * fixed order so two runs touching the same things read the same. */
function fieldsWritten(
  changes: CatalogSyncProductChange[],
  defaultTierKey: string | undefined,
): string[] {
  const seen = new Set<string>();
  for (const change of changes) {
    for (const field of change.changes) seen.add(field.field);
  }
  const ordered = CATALOG_SYNC_FIELDS.filter((field) => seen.has(field));
  // Prices last, the default list first, as everywhere else.
  const defaultColumn =
    defaultTierKey === undefined ? null : syncPriceColumn(defaultTierKey);
  const prices = [...seen]
    .filter((field) => field.startsWith(CATALOG_SYNC_CSV_COLUMNS.pricePrefix))
    .sort((a, b) =>
      a === defaultColumn ? -1 : b === defaultColumn ? 1 : a.localeCompare(b),
    );
  return [...ordered, ...prices];
}
