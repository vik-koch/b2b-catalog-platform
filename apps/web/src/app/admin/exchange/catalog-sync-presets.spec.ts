import { CATALOG_SYNC_PRESETS, catalogPresetFor } from './catalog-sync-presets';

describe('sync presets', () => {
  it('offers the full export, the two partial refreshes, and a custom escape hatch', () => {
    expect(CATALOG_SYNC_PRESETS.map((p) => p.name)).toEqual([
      'full',
      'prices',
      'stock',
      'custom',
    ]);
  });

  it('claims authority for a complete export but leaves hiding switched off', () => {
    const options = catalogPresetFor('full');

    expect(options.productSetAuthoritative).toBe(true);
    // The claim makes hiding *available*; enabling it stays a deliberate act.
    expect(options.softDeleteMissingProducts).toBe(false);
    expect(options.fields).toEqual(['name', 'category', 'stock', 'taxRate']);
    expect(options.createMissing).toBe(true);
  });

  it('makes a price update incapable of adding, renaming or hiding anything', () => {
    const options = catalogPresetFor('prices');

    expect(options.fields).toEqual([]);
    expect(options.createMissing).toBe(false);
    expect(options.createCategories).toBe(false);
    expect(options.productSetAuthoritative).toBe(false);
    expect(options.softDeleteMissingProducts).toBe(false);
    // The one thing it does do.
    expect(options.updateExisting).toBe(true);
  });

  it('makes a stock update carry stock and nothing else', () => {
    const options = catalogPresetFor('stock');

    // The point of the preset: a daily stock file cannot rename a product,
    // move it, reprice it or hide it, whatever else its columns hold.
    expect(options.fields).toEqual(['stock']);
    expect(options.createMissing).toBe(false);
    expect(options.createCategories).toBe(false);
    expect(options.productSetAuthoritative).toBe(false);
    expect(options.softDeleteMissingProducts).toBe(false);
    expect(options.updateExisting).toBe(true);
  });

  it('never returns options the server would refuse', () => {
    for (const { name } of CATALOG_SYNC_PRESETS) {
      const options = catalogPresetFor(name);
      if (options.softDeleteMissingProducts) {
        expect(options.productSetAuthoritative).toBe(true);
      }
    }
  });
});
