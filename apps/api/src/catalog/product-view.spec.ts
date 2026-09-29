import {
  boxDimensionsOf,
  packagingOf,
  PricedProductRow,
  picturesOf,
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

describe('picturesOf', () => {
  const sand = { id: 'v-sand', name: 'Sand', unavailable: false };
  const clay = { id: 'v-clay', name: 'Terracotta', unavailable: true };
  const range = { full: '/media/range.webp', thumb: '/media/range-t.webp' };
  const sandShot = {
    full: '/media/sand.webp',
    thumb: '/media/sand-t.webp',
    variantId: 'v-sand',
  };
  const clayShot = {
    full: '/media/clay.webp',
    thumb: '/media/clay-t.webp',
    variantId: 'v-clay',
  };

  it('labels each picture with the variant it shows, and a range shot with none', () => {
    expect(
      picturesOf({ images: [range, sandShot], variants: [sand] }).images,
    ).toEqual([
      { full: range.full, thumb: range.thumb, variant: null },
      { full: sandShot.full, thumb: sandShot.thumb, variant: 'Sand' },
    ]);
  });

  it('withholds an unavailable variant’s pictures but keeps its name, marked', () => {
    const shown = picturesOf({
      images: [clayShot, range, sandShot],
      variants: [sand, clay],
    });

    expect(shown.images.map((image) => image.variant)).toEqual([null, 'Sand']);
    expect(shown.variants).toEqual([
      { name: 'Sand', unavailable: false },
      { name: 'Terracotta', unavailable: true },
    ]);
  });

  it('reads a picture naming a variant that is gone as showing none', () => {
    expect(picturesOf({ images: [clayShot], variants: [sand] }).images).toEqual(
      [{ full: clayShot.full, thumb: clayShot.thumb, variant: null }],
    );
  });

  it('never publishes a variant’s id', () => {
    const shown = picturesOf({ images: [sandShot], variants: [sand] });
    expect(JSON.stringify(shown)).not.toContain('v-sand');
  });
});
