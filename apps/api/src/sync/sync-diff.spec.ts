import {
  SYNC_ALL_FIELDS,
  SyncOptions,
  SyncRow,
} from '@b2b-catalog-platform/shared';
import {
  ExistingCategory,
  ExistingProduct,
  ExistingTier,
  SyncCatalogState,
  planSync,
} from './sync-diff';

/** The demo's one extra price list; the base list is a column, not a row. */
const wholesale: ExistingTier = { id: 'tier-w', key: 'wholesale' };

const beans: ExistingCategory = {
  id: 'cat-1',
  sourceId: 'C-1',
  slug: 'coffee-beans',
  name: 'Coffee Beans',
};
const gear: ExistingCategory = {
  id: 'cat-2',
  sourceId: 'C-2',
  slug: 'equipment',
  name: 'Equipment',
};

const product = (over: Partial<ExistingProduct> = {}): ExistingProduct => ({
  id: 'p-1',
  sourceId: 'A-1',
  slug: 'espresso-blend',
  name: 'Espresso Blend',
  priceMinor: 1890,
  tierPrices: {},
  categoryId: beans.id,
  deletedAt: null,
  ...over,
});

const state = (over: Partial<SyncCatalogState> = {}): SyncCatalogState => ({
  products: [product()],
  categories: [beans, gear],
  tiers: [wholesale],
  ...over,
});

const options = (over: Partial<SyncOptions> = {}): SyncOptions =>
  ({
    fields: SYNC_ALL_FIELDS,
    createMissing: true,
    updateExisting: true,
    restoreReturning: true,
    createCategories: true,
    productSetAuthoritative: false,
    softDeleteMissingProducts: false,
    ...over,
  }) as SyncOptions;

const row = (over: Partial<SyncRow> = {}): SyncRow => ({
  sourceId: 'A-1',
  ...over,
});

describe('planSync', () => {
  it('reports a price change and nothing else', () => {
    const { plan, actions } = planSync(
      [row({ prices: { default: 1990 } })],
      options(),
      state(),
    );

    expect(plan.summary).toMatchObject({ update: 1, create: 0, unchanged: 0 });
    expect(plan.products[0]).toMatchObject({
      kind: 'update',
      sourceId: 'A-1',
      slug: 'espresso-blend',
      changes: [{ field: 'price:default', from: 1890, to: 1990 }],
    });
    expect(actions.updateProducts).toEqual([{ id: 'p-1', priceMinor: 1990 }]);
  });

  it('counts an identical row as unchanged', () => {
    const { plan, actions } = planSync(
      [row({ name: 'Espresso Blend', prices: { default: 1890 } })],
      options(),
      state(),
    );

    expect(plan.summary).toMatchObject({ unchanged: 1, update: 0 });
    expect(actions.updateProducts).toEqual([]);
  });

  it('does not write a field the run did not declare', () => {
    const { actions } = planSync(
      [row({ name: 'Renamed By File', prices: { default: 1990 } })],
      options({ fields: [] }),
      state(),
    );

    // Prices are self-describing, so the price still lands; the name does not.
    expect(actions.updateProducts).toEqual([{ id: 'p-1', priceMinor: 1990 }]);
  });

  it('creates an unknown product, and needs a name, price and category to do it', () => {
    const complete = planSync(
      [
        row({
          sourceId: 'A-9',
          name: 'Chemex',
          categorySourceId: 'C-2',
          categoryName: 'Equipment',
          prices: { default: 4500 },
        }),
      ],
      options(),
      state(),
    );
    expect(complete.actions.createProducts).toEqual([
      {
        sourceId: 'A-9',
        name: 'Chemex',
        priceMinor: 4500,
        categoryId: 'cat-2',
        categorySourceId: null,
        tierPrices: [],
      },
    ]);

    const priceless = planSync(
      [
        row({
          sourceId: 'A-9',
          name: 'Chemex',
          categorySourceId: 'C-2',
          categoryName: 'Equipment',
        }),
      ],
      options(),
      state(),
    );
    expect(priceless.actions.createProducts).toEqual([]);
    expect(priceless.plan.rowErrors[0].message).toMatch(
      /needs a name, a price/,
    );
  });

  it('matches a category by source id, whatever the file calls it', () => {
    const { actions, plan } = planSync(
      [row({ categorySourceId: 'C-2', categoryName: 'Equipment' })],
      options(),
      state(),
    );

    expect(actions.updateProducts).toEqual([
      { id: 'p-1', categoryId: 'cat-2', categorySourceId: null },
    ]);
    expect(plan.products[0].changes).toEqual([
      { field: 'category', from: 'Coffee Beans', to: 'Equipment' },
    ]);
  });

  it('renames a known category instead of creating a second one', () => {
    const { actions, plan } = planSync(
      [row({ categorySourceId: 'C-1', categoryName: 'Beans' })],
      options(),
      state(),
    );

    expect(actions.createCategories).toEqual([]);
    expect(actions.updateCategories).toEqual([{ id: 'cat-1', name: 'Beans' }]);
    expect(plan.categories).toEqual([
      { kind: 'rename', name: 'Beans', from: 'Coffee Beans', productCount: 1 },
    ]);
    expect(plan.summary).toMatchObject({
      categoriesCreated: 0,
      categoriesRenamed: 1,
    });
  });

  it('leaves the category alone when the run does not write categories', () => {
    const { actions } = planSync(
      [row({ categorySourceId: 'C-1', categoryName: 'Beans' })],
      options({ fields: ['name'] }),
      state(),
    );

    expect(actions.updateCategories).toEqual([]);
  });

  it('creates an unknown category once, unparented, and counts its rows', () => {
    const { actions, plan } = planSync(
      [
        row({
          sourceId: 'A-1',
          categorySourceId: 'C-3',
          categoryName: 'Grinders',
        }),
        row({
          sourceId: 'A-2',
          name: 'Hand Grinder',
          categorySourceId: 'C-3',
          categoryName: 'Grinders',
          prices: { default: 8900 },
        }),
      ],
      options(),
      state(),
    );

    expect(actions.createCategories).toEqual([
      { sourceId: 'C-3', name: 'Grinders' },
    ]);
    expect(plan.categories).toEqual([
      { kind: 'create', name: 'Grinders', from: null, productCount: 2 },
    ]);
  });

  it('fails the row when categories may not be created', () => {
    const { plan, actions } = planSync(
      [row({ categorySourceId: 'C-3', categoryName: 'Grinders' })],
      options({ createCategories: false }),
      state(),
    );

    expect(actions.createCategories).toEqual([]);
    expect(plan.rowErrors[0].message).toMatch(
      /Unknown category "Grinders" \(C-3\)/,
    );
  });

  it('fails the row when the file gives one category id two names', () => {
    const { plan, actions } = planSync(
      [
        row({
          sourceId: 'A-1',
          categorySourceId: 'C-1',
          categoryName: 'Beans',
        }),
        row({
          sourceId: 'A-2',
          categorySourceId: 'C-1',
          categoryName: 'Green Beans',
        }),
      ],
      options(),
      state(),
    );

    expect(plan.rowErrors).toEqual([
      {
        row: 2,
        sourceId: 'A-2',
        message:
          'Category "C-1" is named both "Beans" and "Green Beans" in this file',
      },
    ]);
    expect(actions.updateCategories).toEqual([{ id: 'cat-1', name: 'Beans' }]);
  });

  it('tolerates incidental case and spacing differences within the file', () => {
    const { plan } = planSync(
      [
        row({
          sourceId: 'A-1',
          categorySourceId: 'C-1',
          categoryName: 'Beans',
        }),
        row({
          sourceId: 'A-2',
          name: 'Green Beans',
          categorySourceId: 'C-1',
          categoryName: 'beans',
          prices: { default: 1200 },
        }),
      ],
      options(),
      state(),
    );

    expect(plan.rowErrors).toEqual([]);
  });

  it('allows two categories to share a name, since ids differ', () => {
    const { plan, actions } = planSync(
      [row({ categorySourceId: 'C-2', categoryName: 'Coffee Beans' })],
      options(),
      state(),
    );

    expect(plan.rowErrors).toEqual([]);
    expect(actions.updateCategories).toEqual([
      { id: 'cat-2', name: 'Coffee Beans' },
    ]);
  });

  describe('the delete sweep', () => {
    const missing = state({
      products: [product(), product({ id: 'p-2', sourceId: 'A-2' })],
    });

    it('soft-deletes products absent from an authoritative file', () => {
      const { plan, actions } = planSync(
        [row()],
        options({
          softDeleteMissingProducts: true,
          productSetAuthoritative: true,
        }),
        missing,
      );

      expect(actions.softDeleteProductIds).toEqual(['p-2']);
      expect(plan.summary.softDelete).toBe(1);
    });

    it('deletes nothing without authority over the product set', () => {
      const { actions } = planSync(
        [row()],
        options({ softDeleteMissingProducts: true }),
        missing,
      );

      expect(actions.softDeleteProductIds).toEqual([]);
    });

    it('keeps manually created products and reports them', () => {
      const withManual = state({
        products: [
          product(),
          product({ id: 'p-3', sourceId: 'manual:abc', name: 'Demo Mug' }),
        ],
      });

      const { plan, actions } = planSync(
        [row()],
        options({
          softDeleteMissingProducts: true,
          productSetAuthoritative: true,
        }),
        withManual,
      );

      expect(actions.softDeleteProductIds).toEqual([]);
      expect(plan.keptManual).toEqual([
        { sourceId: 'manual:abc', name: 'Demo Mug' },
      ]);
      expect(plan.summary.keptManual).toBe(1);
    });

    it('never plans a category deletion, but reports the ones it empties', () => {
      const { plan, actions } = planSync(
        [],
        options({
          softDeleteMissingProducts: true,
          productSetAuthoritative: true,
        }),
        state(),
      );

      expect(actions).not.toHaveProperty('deleteCategories');
      expect(plan.emptiedCategories).toEqual([
        { slug: 'coffee-beans', name: 'Coffee Beans' },
      ]);
    });
  });

  it('restores a soft-deleted product that returns to the file', () => {
    const { plan, actions } = planSync(
      [row({ prices: { default: 1990 } })],
      options(),
      state({ products: [product({ deletedAt: new Date() })] }),
    );

    expect(actions.restoreProductIds).toEqual(['p-1']);
    // The price change rides along with the restore.
    expect(actions.updateProducts).toEqual([{ id: 'p-1', priceMinor: 1990 }]);
    expect(plan.products[0].kind).toBe('restore');
    expect(plan.summary.restore).toBe(1);
  });

  it('leaves a soft-deleted product alone when restoring is off', () => {
    const { actions } = planSync(
      [row()],
      options({ restoreReturning: false }),
      state({ products: [product({ deletedAt: new Date() })] }),
    );

    expect(actions.restoreProductIds).toEqual([]);
  });

  it('carries parse errors into the plan and counts them', () => {
    const { plan } = planSync([row()], options(), state(), [
      { row: 4, sourceId: null, message: 'Missing sourceId' },
    ]);

    expect(plan.summary.errors).toBe(1);
    expect(plan.rowErrors).toHaveLength(1);
  });

  describe('tier prices (FR-AUTH-05)', () => {
    it('writes an additional list without touching the base price', () => {
      const result = planSync(
        [row({ prices: { wholesale: 1500 } })],
        options(),
        state(),
      );

      expect(result.actions.updateProducts).toEqual([
        { id: 'p-1', tierPrices: [{ tierId: 'tier-w', priceMinor: 1500 }] },
      ]);
      // The base price is absent from the file, so it is left alone — the same
      // "absent is not empty" rule every other field follows.
      expect(result.actions.updateProducts[0].priceMinor).toBeUndefined();
    });

    it('shows the base price as what a tier moves away from', () => {
      const result = planSync(
        [row({ prices: { wholesale: 1500 } })],
        options(),
        state(),
      );

      // A tier with no override charges the base price today, so that is the
      // number the admin is comparing against — not a blank.
      expect(result.plan.products[0].changes).toEqual([
        { field: 'price:wholesale', from: 1890, to: 1500 },
      ]);
    });

    it('leaves an unchanged override alone', () => {
      const result = planSync(
        [row({ prices: { wholesale: 1500 } })],
        options(),
        state({ products: [product({ tierPrices: { wholesale: 1500 } })] }),
      );

      expect(result.actions.updateProducts).toEqual([]);
      expect(result.plan.summary.unchanged).toBe(1);
    });

    it('still writes an override that equals the base price', () => {
      const result = planSync(
        [row({ prices: { wholesale: 1890 } })],
        options(),
        state(),
      );

      // Not a no-op: it pins that tier's price, so a later change to the base
      // price leaves this list where the file put it.
      expect(result.actions.updateProducts).toEqual([
        { id: 'p-1', tierPrices: [{ tierId: 'tier-w', priceMinor: 1890 }] },
      ]);
    });

    it('carries a new product’s tier prices into its creation', () => {
      const result = planSync(
        [
          row({
            sourceId: 'A-9',
            name: 'Chemex',
            categorySourceId: 'C-2',
            categoryName: 'Equipment',
            prices: { default: 4500, wholesale: 4000 },
          }),
        ],
        options(),
        state(),
      );

      expect(result.actions.createProducts[0]).toMatchObject({
        priceMinor: 4500,
        tierPrices: [{ tierId: 'tier-w', priceMinor: 4000 }],
      });
    });

    it('skips a row naming a price list this catalog does not have', () => {
      const result = planSync(
        [row({ prices: { retail: 1500 } })],
        options(),
        state(),
      );

      // Named, not guessed at: the message lists what would have worked, the
      // same treatment an unknown category gets.
      expect(result.plan.rowErrors[0].message).toContain('"retail"');
      expect(result.plan.rowErrors[0].message).toContain('"default"');
      expect(result.plan.rowErrors[0].message).toContain('"wholesale"');
      expect(result.actions.updateProducts).toEqual([]);
    });

    it('refuses the whole row, base price included, on an unknown list', () => {
      const result = planSync(
        [row({ prices: { default: 999, retail: 1500 } })],
        options(),
        state(),
      );

      // Half-applying a row whose converter is evidently broken would be worse
      // than skipping it.
      expect(result.actions.updateProducts).toEqual([]);
    });
  });
});
