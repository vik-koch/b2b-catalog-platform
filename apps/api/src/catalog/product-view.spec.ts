import {
  boxDimensionsOf,
  packagingOf,
  PricedProductRow,
  unitPricesOf,
} from './product-view';

/**
 * The step between a stored row and the read contract: a piece price becomes
 * one price per unit the product is sold in (FR-UNIT-05/10).
 *
 * The arithmetic is the shared library's and tested there; what these assert is
 * the projection — which figures are published, and that they are exact.
 */

/** A price of 1.99 a piece, sold in packs of 20 and boxes of 3 packs. */
const row: PricedProductRow = {
  priceMinor: 199,
  piecesPerPack: 20,
  packsPerBox: 3,
  minPieceQty: 20,
};

describe('unitPricesOf', () => {
  it('prices a pack and a box as whole multiples of the piece price', () => {
    expect(unitPricesOf(row)).toEqual({
      piece: 199,
      pack: 3980,
      box: 11940,
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

  it('prices any pack size exactly, there being nothing left to divide', () => {
    expect(unitPricesOf({ ...row, piecesPerPack: 15 }).pack).toBe(2985);
  });
});

describe('the projection', () => {
  it('publishes the packaging the browser needs', () => {
    expect(packagingOf(row)).toEqual({
      piecesPerPack: 20,
      packsPerBox: 3,
      minPieceQty: 20,
    });
  });

  it('gives box dimensions only to a product that has a box', () => {
    const dimensions = { boxVolume: '0.045', boxWeight: '12.500', boxCount: 1 };
    expect(boxDimensionsOf({ ...row, ...dimensions })).toEqual({
      volume: '0.045',
      weight: '12.500',
      count: 1,
    });
    expect(
      boxDimensionsOf({ ...row, ...dimensions, packsPerBox: null }),
    ).toBeNull();
  });

  it('carries the box count through, so a split consignment is visible', () => {
    expect(
      boxDimensionsOf({
        ...row,
        boxVolume: null,
        boxWeight: null,
        boxCount: 2,
      }),
    ).toEqual({ volume: null, weight: null, count: 2 });
  });
});
