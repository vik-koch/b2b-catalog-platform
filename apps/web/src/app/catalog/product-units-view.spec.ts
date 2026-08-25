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
    // €19.99 per pack of 10 stored as basis 10: the per-piece figure needs
    // three decimals, the pack and box prices are exact.
    const prices = {
      pieceMilliMinor: 199_900,
      pieceLotMinor: 1999,
      pack: 1999,
      box: 7996,
    };

    const view = units();
    const rows = (['piece', 'pack', 'box'] as const).map((unit) =>
      view.priceRow(prices, unit),
    );

    expect(rows.map((r) => plainSpaces(r?.price ?? ''))).toEqual([
      '1,999 €',
      '19,99 €',
      '79,96 €',
    ]);
    expect(rows.map((r) => r?.label)).toEqual(['per pcs', 'per pk', 'per bx']);
  });

  it('caps the per-piece price at three decimals', () => {
    // €102.70 per six pieces is €17.11666…, which must not print every digit
    // the thousandths scale carries — the extra precision is there to avoid a
    // double rounding, not to be shown.
    const row = units().priceRow(
      {
        pieceMilliMinor: 1_711_667,
        pieceLotMinor: 10_270,
        pack: 10_270,
        box: 41_080,
      },
      'piece',
    );

    expect(plainSpaces(row?.price ?? '')).toBe('17,117 €');
  });

  it('shows a whole-cent per-piece price without trailing noise', () => {
    const row = units().priceRow(
      {
        pieceMilliMinor: 500_000,
        pieceLotMinor: 500,
        pack: null,
        box: null,
      },
      'piece',
    );

    expect(plainSpaces(row?.price ?? '')).toBe('5,00 €');
  });

  // A unit the product is not sold in has no figure to invent, and the caller
  // words the absence rather than printing a zero.
  it('answers nothing for a unit the product carries no price for', () => {
    const row = units().priceRow(
      {
        pieceMilliMinor: 500_000,
        pieceLotMinor: 500,
        pack: null,
        box: null,
      },
      'pack',
    );

    expect(row).toBeNull();
  });
});

describe('packagingRows', () => {
  it('lists the box dimensions with their units', () => {
    const rows = units().packagingRows({
      volume: '0.250',
      weight: '12.500',
      count: 1,
    });

    expect(rows).toEqual([
      { label: 'Box volume', value: '0.250 m³' },
      { label: 'Box weight', value: '12.500 kg' },
    ]);
  });

  it('says what a figure covers where a product ships as more than one box', () => {
    const u = units();
    const box = { volume: '0.250', weight: '12.500', count: 2 };
    expect(u.packagingRows(box).map((r) => r.label)).toEqual([
      'Box volume (for 2)',
      'Box weight (for 2)',
    ]);
    // The values are the totals already, so only the labels change.
    expect(u.packagingRows(box).map((r) => r.value)).toEqual(
      u.packagingRows({ ...box, count: 1 }).map((r) => r.value),
    );
  });

  it('leaves the labels alone for the usual single box', () => {
    expect(
      units()
        .packagingRows({ volume: '0.250', weight: null, count: 1 })
        .map((r) => r.label),
    ).toEqual(['Box volume']);
  });

  it('leaves the packaging summary and the minimum to the buying block', () => {
    const rows = units().packagingRows({
      volume: '0.250',
      weight: null,
      count: 1,
    });
    expect(rows.map((r) => r.label)).not.toContain('Packaging');
    expect(rows.map((r) => r.label)).not.toContain('Minimum order');
  });

  it('is empty for a plain product, so the table is unchanged', () => {
    expect(units().packagingRows(null)).toEqual([]);
  });
});
