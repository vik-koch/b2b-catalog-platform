import {
  boxDimensionsOf,
  displayPriceMinor,
  packagingOf,
  PricedProductRow,
  unitPricesOf,
} from './product-view';

/**
 * The step between a stored row and the read contract: a price covering
 * `priceBasisPieces` pieces becomes one price per unit the product is sold in
 * (FR-UNIT-05/10), and the basis itself stays behind (FR-UNIT-04).
 *
 * The arithmetic is the shared library's and tested there; what these assert is
 * the projection — which figures are published, and that the exact ones are
 * exact.
 */

/** A price of 19.99 per 10 pieces, sold in packs of 20 and boxes of 3 packs. */
const row: PricedProductRow = {
  priceMinor: 1999,
  priceBasisPieces: 10,
  piecesPerPack: 20,
  packsPerBox: 3,
  minPieceQty: 20,
};

describe('unitPricesOf', () => {
  it('prices a pack and a box as whole multiples of the stored price', () => {
    expect(unitPricesOf(row)).toEqual({
      // 20 pieces = 2 basis units, 60 pieces = 6 — never a rounded figure.
      pack: 3998,
      box: 11994,
      pieceMilliMinor: 1999 * 100,
    });
  });

  it('leaves out the units a product is not sold in', () => {
    expect(
      unitPricesOf({ ...row, piecesPerPack: null, packsPerBox: null }),
    ).toMatchObject({ pack: null, box: null });
  });

  it('has no box price without a pack to fill it with', () => {
    expect(unitPricesOf({ ...row, packsPerBox: null }).box).toBeNull();
  });

  it('rounds a per-piece price that cannot be exact, but not the pack', () => {
    // 10.00 for three pieces is 333.333… minor each — the one figure that can
    // be inexact, which is why it is published in thousandths and no total is
    // derived from it. A pack of 21 is still seven whole basis units.
    const thirds = {
      ...row,
      priceMinor: 1000,
      priceBasisPieces: 3,
      piecesPerPack: 21,
      minPieceQty: 3,
    };

    expect(unitPricesOf(thirds).pieceMilliMinor).toBe(333333);
    expect(unitPricesOf(thirds).pack).toBe(7000);
  });

  it('reports a missing price rather than a wrong one when the basis cannot divide a pack', () => {
    // The DB check constraint forbids this; if it is ever broken, a pack has no
    // exact price and none is invented.
    expect(unitPricesOf({ ...row, piecesPerPack: 15 }).pack).toBeNull();
  });
});

describe('the projection', () => {
  it('publishes packaging without the price basis', () => {
    expect(packagingOf(row)).toEqual({
      piecesPerPack: 20,
      packsPerBox: 3,
      minPieceQty: 20,
    });
  });

  it('rounds the legacy per-piece price to whole minor units', () => {
    expect(displayPriceMinor(row)).toBe(200);
  });

  it('gives box dimensions only to a product that has a box', () => {
    const dimensions = { boxVolume: '0.045', boxWeight: '12.500' };
    expect(boxDimensionsOf({ ...row, ...dimensions })).toEqual({
      volume: '0.045',
      weight: '12.500',
    });
    expect(
      boxDimensionsOf({ ...row, ...dimensions, packsPerBox: null }),
    ).toBeNull();
  });
});
