import { TestBed } from '@angular/core/testing';
import { APP_TEXT } from '../config/app-text';
import { defaultAppText } from '../config/app-text.fixture';
import { DEPLOYMENT_CONFIG } from '../config/deployment-config';
import { DeploymentConfig } from '../config/deployment-config.type';
import { useProductUnits } from './product-units-view';

const config = {
  catalog: {
    currency: { code: 'EUR', locale: 'de-DE' },
    boxUnits: { volume: 'm³', weight: 'kg' },
  },
} as unknown as DeploymentConfig;

const packaged = { piecesPerPack: 6, packsPerBox: 4, minPieceQty: 6 };
const packOnly = { piecesPerPack: 10, packsPerBox: null, minPieceQty: 100 };
const plain = { piecesPerPack: null, packsPerBox: null, minPieceQty: 1 };

/** Intl separates a number from its currency symbol with a non-breaking space,
 * and which one varies by ICU version — compare on plain spaces. */
const plainSpaces = (text: string) => text.replace(/[\u00a0\u202f]/g, ' ');

function units() {
  TestBed.configureTestingModule({
    providers: [
      { provide: APP_TEXT, useValue: defaultAppText },
      { provide: DEPLOYMENT_CONFIG, useValue: config },
    ],
  });
  return TestBed.runInInjectionContext(() => useProductUnits());
}

describe('packagingSummary', () => {
  it('reads as a formula ending in the pieces a box holds', () => {
    expect(units().packagingSummary(packaged)).toBe('4 pk × 6 pcs = 24 pcs');
  });

  it('states the pieces per pack where there is no box', () => {
    expect(units().packagingSummary(packOnly)).toBe('10 pcs per pk');
  });

  it('says nothing about a product with no packaging', () => {
    expect(units().packagingSummary(plain)).toBeNull();
  });

  it('reads correctly for a pack holding a single piece', () => {
    // The case that ruled out full unit words: "4 pack × 1 pieces" would be
    // wrong, and an abbreviation is right after any number.
    expect(
      units().packagingSummary({
        piecesPerPack: 1,
        packsPerBox: 4,
        minPieceQty: 1,
      }),
    ).toBe('4 pk × 1 pcs = 4 pcs');
  });
});

describe('minimumOrder', () => {
  it('states a real minimum', () => {
    expect(units().minimumOrder(packOnly)).toBe('100 pcs');
  });

  // Even where it states no rule: the line answers the question either way,
  // and one that comes and goes moves everything under it.
  it('states a minimum of one too', () => {
    expect(units().minimumOrder(plain)).toBe('1 pcs');
  });
});

describe('priceRow', () => {
  it('prices the selected unit, worded the same whichever it is', () => {
    // €1.999 a piece is not a price: every unit reads in whole minor units,
    // because the stored figure is the piece's own.
    const prices = { piece: 200, pack: 2000, box: 8000 };

    const view = units();
    const rows = (['piece', 'pack', 'box'] as const).map((unit) =>
      view.priceRow(prices, unit),
    );

    expect(rows.map((r) => plainSpaces(r?.price ?? ''))).toEqual([
      '2,00 €',
      '20,00 €',
      '80,00 €',
    ]);
    expect(rows.map((r) => r?.label)).toEqual(['per pcs', 'per pk', 'per bx']);
  });

  // A unit the product is not sold in has no figure to invent, and the caller
  // words the absence rather than printing a zero.
  it('answers nothing for a unit the product carries no price for', () => {
    const row = units().priceRow({ piece: 500, pack: null, box: null }, 'pack');

    expect(row).toBeNull();
  });
});

describe('packagingRows', () => {
  const box = { volume: '0.250', weight: '12.500', count: 1 };

  it('states what a pack and a box contain, then the box dimensions', () => {
    expect(units().packagingRows(packaged, box)).toEqual([
      { label: 'Pack contains', value: '6 pcs' },
      { label: 'Box contains', value: '24 pcs' },
      { label: 'Box volume', value: '0.250 m³' },
      { label: 'Box weight', value: '12.500 kg' },
    ]);
  });

  it('states the pack alone where the product has no box', () => {
    expect(units().packagingRows(packOnly, null)).toEqual([
      { label: 'Pack contains', value: '10 pcs' },
    ]);
  });

  it('leaves out a unit that holds a single piece', () => {
    const u = units();
    const singles = { piecesPerPack: 1, packsPerBox: 12, minPieceQty: 1 };
    const labels = (packaging: typeof singles) =>
      u.packagingRows(packaging, box).map((r) => r.label);
    expect(labels(singles)).toEqual([
      'Box contains',
      'Box volume',
      'Box weight',
    ]);
    expect(labels({ ...singles, packsPerBox: 1 })).toEqual([
      'Box volume',
      'Box weight',
    ]);
  });

  it('leaves the contents to staff where a product ships as more than one box', () => {
    const u = units();
    const several = { ...box, count: 2 };
    expect(u.packagingRows(packaged, several).map((r) => r.label)).toEqual([
      'Box volume (for 2)',
      'Box weight (for 2)',
    ]);
    // The values are the totals already, so only the labels change.
    expect(u.packagingRows(packaged, several).map((r) => r.value)).toEqual(
      u
        .packagingRows(packaged, box)
        .slice(2)
        .map((r) => r.value),
    );
  });

  it('leaves the dimension labels alone for the usual single box', () => {
    expect(
      units()
        .packagingRows(packaged, { volume: '0.250', weight: null, count: 1 })
        .map((r) => r.label),
    ).toEqual(['Pack contains', 'Box contains', 'Box volume']);
  });

  it('leaves the packaging summary and the minimum to the buying block', () => {
    const labels = units()
      .packagingRows(packaged, box)
      .map((r) => r.label);
    expect(labels).not.toContain('Packaging');
    expect(labels).not.toContain('Minimum order');
  });

  it('is empty for a plain product, so the table is unchanged', () => {
    expect(units().packagingRows(plain, null)).toEqual([]);
  });
});
