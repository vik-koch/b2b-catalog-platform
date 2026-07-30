import { SYNC_PRESETS, presetFor } from './sync-presets';

describe('sync presets', () => {
  it('offers the full export, the price update, and a custom escape hatch', () => {
    expect(SYNC_PRESETS.map((p) => p.name)).toEqual([
      'full',
      'prices',
      'custom',
    ]);
  });

  it('claims authority for a complete export but leaves hiding switched off', () => {
    const options = presetFor('full');

    expect(options.productSetAuthoritative).toBe(true);
    // The claim makes hiding *available*; enabling it stays a deliberate act.
    expect(options.softDeleteMissingProducts).toBe(false);
    expect(options.fields).toEqual(['name', 'category']);
    expect(options.createMissing).toBe(true);
  });

  it('makes a price update incapable of adding, renaming or hiding anything', () => {
    const options = presetFor('prices');

    expect(options.fields).toEqual([]);
    expect(options.createMissing).toBe(false);
    expect(options.createCategories).toBe(false);
    expect(options.productSetAuthoritative).toBe(false);
    expect(options.softDeleteMissingProducts).toBe(false);
    // The one thing it does do.
    expect(options.updateExisting).toBe(true);
  });

  it('never returns options the server would refuse', () => {
    for (const { name } of SYNC_PRESETS) {
      const options = presetFor(name);
      if (options.softDeleteMissingProducts) {
        expect(options.productSetAuthoritative).toBe(true);
      }
    }
  });
});
