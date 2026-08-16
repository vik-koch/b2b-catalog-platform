import {
  availableUnits,
  basisDividesQuantities,
  correctPieceQuantity,
  isValidPieceQuantity,
  piecePriceMilliMinor,
  piecesFor,
  piecesPerUnit,
  ProductPackaging,
  totalMinor,
} from './product-units';

/** The demo's coffee: a 200 g package, six to a pack, four packs to a box. */
const packaged: ProductPackaging = {
  piecesPerPack: 6,
  packsPerBox: 4,
  minPieceQty: 6,
};

/** A product with no packaging at all — sold by the piece, one at a time. */
const plain: ProductPackaging = {
  piecesPerPack: null,
  packsPerBox: null,
  minPieceQty: 1,
};

/** Packs but no box, and a minimum well above the pack size. */
const packOnly: ProductPackaging = {
  piecesPerPack: 10,
  packsPerBox: null,
  minPieceQty: 100,
};

describe('piecesPerUnit', () => {
  it('multiplies the two levels for a box', () => {
    expect(piecesPerUnit(packaged, 'piece')).toBe(1);
    expect(piecesPerUnit(packaged, 'pack')).toBe(6);
    expect(piecesPerUnit(packaged, 'box')).toBe(24);
  });

  it('is null for a unit the product is not sold in', () => {
    expect(piecesPerUnit(plain, 'pack')).toBeNull();
    expect(piecesPerUnit(plain, 'box')).toBeNull();
    expect(piecesPerUnit(packOnly, 'box')).toBeNull();
  });

  it('refuses a box without a pack rather than treating packs as 1', () => {
    const boxWithoutPack: ProductPackaging = {
      piecesPerPack: null,
      packsPerBox: 4,
      minPieceQty: 1,
    };
    expect(piecesPerUnit(boxWithoutPack, 'box')).toBeNull();
  });
});

describe('availableUnits', () => {
  it('lists only what the packaging defines, smallest first', () => {
    expect(availableUnits(packaged)).toEqual(['piece', 'pack', 'box']);
    expect(availableUnits(packOnly)).toEqual(['piece', 'pack']);
    expect(availableUnits(plain)).toEqual(['piece']);
  });
});

describe('piecesFor', () => {
  it('scales by the quantity', () => {
    expect(piecesFor(packaged, 'box', 3)).toBe(72);
    expect(piecesFor(packaged, 'pack', 2)).toBe(12);
    expect(piecesFor(packaged, 'piece', 12)).toBe(12);
  });

  it('is null for an unavailable unit, so nothing can price a box that does not exist', () => {
    expect(piecesFor(plain, 'box', 1)).toBeNull();
  });
});

describe('correctPieceQuantity', () => {
  it('rounds up to the next multiple, never down', () => {
    // The client's own example: 140 against a minimum of 100 becomes 200.
    expect(correctPieceQuantity(packOnly, 140)).toBe(200);
    expect(correctPieceQuantity(packOnly, 101)).toBe(200);
    expect(correctPieceQuantity(packOnly, 199)).toBe(200);
  });

  it('leaves an already-valid quantity alone', () => {
    expect(correctPieceQuantity(packOnly, 100)).toBe(100);
    expect(correctPieceQuantity(packOnly, 200)).toBe(200);
    expect(correctPieceQuantity(packaged, 12)).toBe(12);
  });

  it('lifts anything at or below the minimum to the minimum', () => {
    expect(correctPieceQuantity(packOnly, 1)).toBe(100);
    expect(correctPieceQuantity(packOnly, 0)).toBe(100);
    expect(correctPieceQuantity(packOnly, -5)).toBe(100);
  });

  it('is a no-op where there is no minimum', () => {
    expect(correctPieceQuantity(plain, 1)).toBe(1);
    expect(correctPieceQuantity(plain, 137)).toBe(137);
  });
});

describe('isValidPieceQuantity', () => {
  it('distinguishes a quantity that needs announcing from one that does not', () => {
    expect(isValidPieceQuantity(packOnly, 200)).toBe(true);
    expect(isValidPieceQuantity(packOnly, 140)).toBe(false);
    expect(isValidPieceQuantity(packOnly, 50)).toBe(false);
    expect(isValidPieceQuantity(plain, 3.5)).toBe(false);
  });
});

describe('totalMinor', () => {
  it('is exact for a price given per piece', () => {
    expect(totalMinor(500, 1, 1)).toBe(500);
    expect(totalMinor(500, 1, 24)).toBe(12000);
  });

  it('is exact for a price given per pack — the case that motivated the invariant', () => {
    // €19.99 per pack of 10. Rounding a per-piece price (199.9) to 200 and
    // multiplying back would charge €20.00 a pack.
    expect(totalMinor(1999, 10, 10)).toBe(1999);
    expect(totalMinor(1999, 10, 20)).toBe(3998);
    // A box of four such packs.
    expect(totalMinor(1999, 10, 40)).toBe(7996);
  });

  it('is exact for a price given per 100 pieces', () => {
    expect(totalMinor(4999, 100, 100)).toBe(4999);
    expect(totalMinor(4999, 100, 300)).toBe(14997);
  });

  it('refuses a quantity that is not a whole number of basis units', () => {
    // A caller that gets here bypassed the quantity rules.
    expect(totalMinor(1999, 10, 15)).toBeNull();
    expect(totalMinor(1999, 10, 1)).toBeNull();
  });

  it('refuses a nonsensical basis instead of dividing by zero', () => {
    expect(totalMinor(1999, 0, 10)).toBeNull();
  });
});

describe('piecePriceMilliMinor', () => {
  it('is exact where the basis divides cleanly', () => {
    expect(piecePriceMilliMinor(500, 1)).toBe(500_000);
    expect(piecePriceMilliMinor(1999, 10)).toBe(199_900); // €1.999
    expect(piecePriceMilliMinor(4999, 100)).toBe(49_990); // €0.4999 → €0.500
  });

  it('rounds where no decimal precision could be exact', () => {
    // One sixth does not terminate in base 10 at any precision.
    expect(piecePriceMilliMinor(1999, 6)).toBe(333_167);
  });
});

describe('basisDividesQuantities', () => {
  it('accepts the normal case, where the basis is the pack size', () => {
    expect(basisDividesQuantities(packOnly, 10)).toBe(true);
    expect(basisDividesQuantities(packaged, 6)).toBe(true);
    expect(basisDividesQuantities(plain, 1)).toBe(true);
  });

  it('accepts a basis that divides both the minimum and the pack', () => {
    expect(basisDividesQuantities(packOnly, 5)).toBe(true);
  });

  it('rejects a basis that would leave a total needing rounding', () => {
    // 100 % 3 !== 0, so some purchasable quantity would need rounding.
    expect(basisDividesQuantities(packOnly, 3)).toBe(false);
    // Divides the minimum but not the pack.
    expect(basisDividesQuantities(packaged, 4)).toBe(false);
  });

  it('rejects a basis below one', () => {
    expect(basisDividesQuantities(plain, 0)).toBe(false);
  });
});
