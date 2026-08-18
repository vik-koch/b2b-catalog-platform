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

describe('packagedMinimum', () => {
  it('always states a minimum for a product sold in packs', () => {
    // Grids need every packaged card the same height, so the line is present
    // even where it carries nothing — see the helper's own note.
    const u = units();

    expect(u.packagedMinimum(packaged)).toBe('6 pcs');
    expect(u.packagedMinimum({ ...packaged, minPieceQty: 1 })).toBe('1 pcs');
    expect(u.packagedMinimum({ ...packaged, minPieceQty: 24 })).toBe('24 pcs');
  });

  it('stays silent for a piece-only product with no minimum', () => {
    // Nothing to line up with, so there is no reason to say "1 pcs".
    const u = units();

    expect(u.packagedMinimum(plain)).toBeNull();
    expect(u.packagedMinimum({ ...plain, minPieceQty: 50 })).toBe('50 pcs');
  });
});

describe('minimumOrder', () => {
  it('states a real minimum', () => {
    expect(units().minimumOrder(packOnly)).toBe('100 pcs');
  });

  it('is silent where the minimum is one, which is not a rule', () => {
    expect(units().minimumOrder(plain)).toBeNull();
  });
});

describe('priceRows', () => {
  it('prices every unit the product is sold in, piece first', () => {
    // €19.99 per pack of 10 stored as basis 10: the per-piece figure needs
    // three decimals, the pack and box prices are exact.
    const rows = units().priceRows({
      pieceMilliMinor: 199_900,
      pack: 1999,
      box: 7996,
    });

    expect(rows.map((r) => plainSpaces(r.price))).toEqual([
      '1,999 €',
      '19,99 €',
      '79,96 €',
    ]);
    expect(rows.map((r) => r.label)).toEqual(['per pcs', 'per pk', 'per bx']);
  });

  it('caps the per-piece price at three decimals', () => {
    // €102.70 per six pieces is €17.11666…, which must not print every digit
    // the thousandths scale carries — the extra precision is there to avoid a
    // double rounding, not to be shown.
    const rows = units().priceRows({
      pieceMilliMinor: 1_711_667,
      pack: 10_270,
      box: 41_080,
    });

    expect(plainSpaces(rows[0].price)).toBe('17,117 €');
  });

  it('shows a whole-cent per-piece price without trailing noise', () => {
    const rows = units().priceRows({
      pieceMilliMinor: 500_000,
      pack: null,
      box: null,
    });

    expect(rows).toHaveLength(1);
    expect(plainSpaces(rows[0].price)).toBe('5,00 €');
  });
});

describe('packagingRows', () => {
  it('lists the summary, the minimum and the box dimensions with their units', () => {
    const rows = units().packagingRows(packOnly, {
      volume: '0.250',
      weight: '12.500',
    });

    expect(rows).toEqual([
      { label: 'Packaging', value: '10 pcs per pk' },
      { label: 'Minimum order', value: '100 pcs' },
      // No box on this product, so its dimensions are still listed only when
      // the caller passes them — the product page passes null instead.
      { label: 'Box volume', value: '0.250 m³' },
      { label: 'Box weight', value: '12.500 kg' },
    ]);
  });

  it('is empty for a plain product, so the table is unchanged', () => {
    expect(units().packagingRows(plain, null)).toEqual([]);
  });
});
