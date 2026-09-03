import {
  DEFAULT_LOW_STOCK_THRESHOLD_PIECES,
  lowStockThreshold,
  productAvailability,
} from './product-availability';

const loose = { piecesPerPack: null, packsPerBox: null };
const packed = { piecesPerPack: 6, packsPerBox: null };
const boxed = { piecesPerPack: 6, packsPerBox: 4 };

describe('lowStockThreshold', () => {
  it('is the pieces in one box where the product has one', () => {
    expect(lowStockThreshold(boxed, null, 10)).toBe(24);
  });

  it('falls back to one pack, then to the deployment figure', () => {
    expect(lowStockThreshold(packed, null, 10)).toBe(6);
    expect(lowStockThreshold(loose, null, 10)).toBe(10);
  });

  it('takes the product’s own figure over the whole ladder', () => {
    expect(lowStockThreshold(boxed, 100, 10)).toBe(100);
  });
});

describe('productAvailability', () => {
  const fallback = DEFAULT_LOW_STOCK_THRESHOLD_PIECES;

  it('says nothing at all for an untracked product', () => {
    expect(productAvailability(null, boxed, null, fallback)).toBeNull();
  });

  it('reads zero and below as out of stock', () => {
    // A stocktake correction is a valid figure, not an error to clean up.
    expect(productAvailability(0, boxed, null, fallback)).toBe('out');
    expect(productAvailability(-5, boxed, null, fallback)).toBe('out');
  });

  it('is few left at the threshold and available above it', () => {
    expect(productAvailability(24, boxed, null, fallback)).toBe('low');
    expect(productAvailability(25, boxed, null, fallback)).toBe('in');
  });

  it('reads one figure differently for differently packed products', () => {
    // The point of measuring in boxes: twenty pieces is under one box of 24
    // and well over the ten a loose product is measured against.
    expect(productAvailability(20, boxed, null, fallback)).toBe('low');
    expect(productAvailability(20, loose, null, fallback)).toBe('in');
  });
});
