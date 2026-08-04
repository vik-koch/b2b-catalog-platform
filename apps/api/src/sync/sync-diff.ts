import {
  MANUAL_SOURCE_ID_PREFIX,
  SYNC_PREVIEW_MAX_ITEMS,
  SyncOptions,
  SyncPlan,
  SyncPriceListKey,
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
}

export interface ExistingProduct {
  id: string;
  sourceId: string;
  slug: string;
  name: string;
  priceMinor: number;
  categoryId: string;
  deletedAt: Date | null;
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
    priceMinor: number;
    /** Resolved at apply time: an existing id, or a category this run creates. */
    categoryId: string | null;
    categorySourceId: string | null;
  }[];
  updateProducts: {
    id: string;
    name?: string;
    priceMinor?: number;
    categoryId?: string | null;
    categorySourceId?: string | null;
  }[];
  softDeleteProductIds: string[];
  restoreProductIds: string[];
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

/** Only the default list has a column today; FR-AUTH-05 adds the rest. */
function priceOf(row: SyncRow, key: SyncPriceListKey): number | undefined {
  return row.prices?.[key];
}

export function planSync(
  rows: SyncRow[],
  options: SyncOptions,
  state: SyncCatalogState,
  parseErrors: SyncRowError[] = [],
): SyncPlanResult {
  const writesName = options.fields.includes('name');
  const writesCategory = options.fields.includes('category');

  const productsBySourceId = new Map(
    state.products.map((p) => [p.sourceId, p]),
  );

  const categoriesBySourceId = new Map(
    state.categories.map((c) => [c.sourceId, c]),
  );

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

  let unchanged = 0;
  const seenSourceIds = new Set<string>();

  for (const [index, row] of rows.entries()) {
    const rowNumber = index + 1;
    seenSourceIds.add(row.sourceId);
    const existing = productsBySourceId.get(row.sourceId);

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
            message: `Category "${key}" is named both "${claimed}" and "${name}" in this file`,
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
          message: `Unknown category "${name}" (${key})`,
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
      // and a price. A run that does not write them cannot create.
      const name = writesName ? row.name : undefined;
      const priceMinor = priceOf(row, 'default');
      if (!name || priceMinor === undefined || categoryId === undefined) {
        rowErrors.push({
          row: rowNumber,
          sourceId: row.sourceId,
          message:
            'Cannot create this product — a new product needs a name, a price and a category',
        });
        continue;
      }
      actions.createProducts.push({
        sourceId: row.sourceId,
        name,
        priceMinor,
        categoryId,
        categorySourceId: categorySourceId ?? null,
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

    const price = priceOf(row, 'default');
    if (price !== undefined && price !== existing.priceMinor) {
      changes.push({
        field: syncPriceColumn('default'),
        from: existing.priceMinor,
        to: price,
      });
      update.priceMinor = price;
    }

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
