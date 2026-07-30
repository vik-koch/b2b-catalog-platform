import {
  SYNC_ALL_FIELDS,
  SyncOptions,
  SyncRow,
} from '@b2b-catalog-platform/shared';
import {
  ExistingCategory,
  ExistingProduct,
  SyncCatalogState,
  planSync,
} from './sync-diff';

const beans: ExistingCategory = {
  id: 'cat-1',
  sourceId: 'coffee-beans',
  slug: 'coffee-beans',
  name: 'Coffee Beans',
};
const gear: ExistingCategory = {
  id: 'cat-2',
  sourceId: 'equipment',
  slug: 'equipment',
  name: 'Equipment',
};

const product = (over: Partial<ExistingProduct> = {}): ExistingProduct => ({
  id: 'p-1',
  sourceId: 'A-1',
  slug: 'espresso-blend',
  name: 'Espresso Blend',
  priceMinor: 1890,
  categoryId: beans.id,
  deletedAt: null,
  ...over,
});

const state = (over: Partial<SyncCatalogState> = {}): SyncCatalogState => ({
  products: [product()],
  categories: [beans, gear],
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
      },
    ]);

    const priceless = planSync(
      [row({ sourceId: 'A-9', name: 'Chemex', categoryName: 'Equipment' })],
      options(),
      state(),
    );
    expect(priceless.actions.createProducts).toEqual([]);
    expect(priceless.plan.rowErrors[0].message).toMatch(
      /needs a name, a price/,
    );
  });

  it('matches categories by name, case- and whitespace-insensitively', () => {
    const { actions, plan } = planSync(
      [row({ categoryName: '  equipment ' })],
      options(),
      state(),
    );

    expect(actions.updateProducts).toEqual([
      { id: 'p-1', categoryId: 'cat-2', categorySourceId: null },
    ]);
    expect(plan.products[0].changes).toEqual([
      { field: 'category', from: 'Coffee Beans', to: '  equipment ' },
    ]);
  });

  it('creates an unknown category once, unparented, and counts its rows', () => {
    const { actions, plan } = planSync(
      [
        row({ sourceId: 'A-1', categoryName: 'Grinders' }),
        row({
          sourceId: 'A-2',
          name: 'Hand Grinder',
          categoryName: 'Grinders',
          prices: { default: 8900 },
        }),
      ],
      options(),
      state(),
    );

    expect(actions.createCategories).toEqual([
      { sourceId: 'grinders', name: 'Grinders' },
    ]);
    expect(plan.categories).toEqual([
      { kind: 'create', name: 'Grinders', productCount: 2 },
    ]);
  });

  it('fails the row when categories may not be created', () => {
    const { plan, actions } = planSync(
      [row({ categoryName: 'Grinders' })],
      options({ createCategories: false }),
      state(),
    );

    expect(actions.createCategories).toEqual([]);
    expect(plan.rowErrors[0].message).toMatch(/Unknown category "Grinders"/);
  });

  it('fails the row when two categories share the name the file uses', () => {
    const twin: ExistingCategory = { ...gear, id: 'cat-3', slug: 'gear-2' };
    const { plan } = planSync(
      [row({ categoryName: 'Equipment' })],
      options(),
      state({ categories: [beans, gear, twin] }),
    );

    expect(plan.rowErrors[0].message).toMatch(/ambiguous/);
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
});
