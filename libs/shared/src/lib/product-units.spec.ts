import {
  availableUnits,
  basisDividesQuantities,
  convertUnitQuantity,
  correctQuantity,
  exactLineTotal,
  minimumIsWholeSteps,
  piecePriceMilliMinor,
  piecesFor,
  piecesPerUnit,
  pieceStep,
  ProductPackaging,
  totalMinor,
  unitFloor,
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

describe('pieceStep', () => {
  it('is the pack, which is what cannot be broken open', () => {
    expect(pieceStep(packaged)).toBe(6);
    expect(pieceStep(packOnly)).toBe(10);
  });

  it('falls back to the minimum where there is no pack to move by', () => {
    expect(pieceStep(plain)).toBe(1);
    expect(pieceStep({ ...plain, minPieceQty: 25 })).toBe(25);
  });
});

describe('unitFloor', () => {
  it('is the stated minimum in pieces where that is already whole steps', () => {
    expect(unitFloor(packOnly, 'piece')).toBe(100);
    expect(unitFloor(packaged, 'piece')).toBe(6);
  });

  it('raises a piece minimum that sits between steps', () => {
    // Refused by products_minimum_is_whole_packs, so this is the belt to that
    // braces: a row that predates the rule still lands on the lattice.
    expect(unitFloor({ ...packOnly, minPieceQty: 95 }, 'piece')).toBe(100);
  });

  // The minimum is a statement about the goods, not about the word they are
  // counted in: a shop that will not ship fewer than 24 pieces will not ship
  // three packs of six either.
  it('expresses the same minimum in packs and in boxes', () => {
    const min24: ProductPackaging = { ...packaged, minPieceQty: 24 };

    expect(unitFloor(min24, 'piece')).toBe(24);
    // 24 pieces is four packs of six...
    expect(unitFloor(min24, 'pack')).toBe(4);
    // ...and exactly one box of 24.
    expect(unitFloor(min24, 'box')).toBe(1);
  });

  it('rounds a bigger unit up, since half a box is not something to pick', () => {
    // Ten to a pack, no box; a minimum of 100 is ten packs.
    expect(unitFloor(packOnly, 'pack')).toBe(10);
    // A minimum of 95 does not fill ten whole packs — but nine is under it.
    expect(unitFloor({ ...packOnly, minPieceQty: 95 }, 'pack')).toBe(10);
  });

  it('is one where the minimum is smaller than the unit', () => {
    expect(unitFloor(packaged, 'pack')).toBe(1);
    expect(unitFloor(packaged, 'box')).toBe(1);
  });

  it('is null for a unit the product is not sold in', () => {
    expect(unitFloor(packOnly, 'box')).toBeNull();
    expect(unitFloor(plain, 'pack')).toBeNull();
  });
});

describe('minimumIsWholeSteps', () => {
  it('accepts a minimum that is a whole number of packs', () => {
    expect(minimumIsWholeSteps(packOnly)).toBe(true);
    expect(minimumIsWholeSteps(packaged)).toBe(true);
    expect(minimumIsWholeSteps(plain)).toBe(true);
  });

  it('refuses one that would put the first orderable quantity off the lattice', () => {
    expect(minimumIsWholeSteps({ ...packOnly, minPieceQty: 95 })).toBe(false);
  });
});

describe('correctQuantity', () => {
  // The change this rule went through: the minimum used to be the increment
  // too, so 140 against a minimum of 100 became 200. The pack is what cannot
  // be broken, so 140 is now simply 140 — fourteen whole packs of ten, above a
  // minimum of a hundred.
  it('rounds a piece quantity up to the next whole pack, never down', () => {
    expect(correctQuantity(packOnly, 'piece', 101)).toBe(110);
    expect(correctQuantity(packOnly, 'piece', 199)).toBe(200);
    expect(correctQuantity(packaged, 'piece', 13)).toBe(18);
  });

  it('leaves an already-valid piece quantity alone', () => {
    expect(correctQuantity(packOnly, 'piece', 100)).toBe(100);
    expect(correctQuantity(packOnly, 'piece', 140)).toBe(140);
    expect(correctQuantity(packaged, 'piece', 12)).toBe(12);
  });

  it('lifts anything at or below the minimum to the minimum', () => {
    expect(correctQuantity(packOnly, 'piece', 1)).toBe(100);
    expect(correctQuantity(packOnly, 'piece', 0)).toBe(100);
    expect(correctQuantity(packOnly, 'piece', -5)).toBe(100);
  });

  it('stops at the minimum rather than at one pack', () => {
    // The two figures are different things: 90 is nine whole packs and still
    // below what the shop will ship.
    expect(correctQuantity(packOnly, 'piece', 90)).toBe(100);
  });

  // The rule the piece-only version let anyone walk under: one pack of six is
  // six pieces, which is nowhere near a minimum of 24.
  it('holds a pack or a box to the same minimum', () => {
    const min24: ProductPackaging = { ...packaged, minPieceQty: 24 };

    expect(correctQuantity(min24, 'pack', 1)).toBe(4);
    expect(correctQuantity(min24, 'pack', 5)).toBe(5);
    expect(correctQuantity(min24, 'box', 1)).toBe(1);
  });

  it('moves a pack or a box by one, having no pack to land on', () => {
    const min24: ProductPackaging = { ...packaged, minPieceQty: 24 };

    expect(correctQuantity(min24, 'pack', 7)).toBe(7);
    expect(correctQuantity(min24, 'box', 3)).toBe(3);
  });

  it('is a no-op where there is neither a minimum nor a pack', () => {
    expect(correctQuantity(plain, 'piece', 1)).toBe(1);
    expect(correctQuantity(plain, 'piece', 137)).toBe(137);
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

describe('exactLineTotal', () => {
  // €19.99 for ten pieces: no piece has an exact price, but every orderable
  // quantity does. The minimum is six, so a lot of six costs 6/10 × 1999 —
  // which only divides because the basis divides the minimum.
  const inexactPerPiece = {
    pieceLotMinor: 1999, // the price of one lot of `minPieceQty` pieces
    pack: 1999,
    box: 7996,
  };

  it('multiplies whole lots for a piece line, never the per-piece figure', () => {
    const lots = { piecesPerPack: 10, packsPerBox: 4, minPieceQty: 10 };
    expect(exactLineTotal(inexactPerPiece, lots, 'piece', 10)).toBe(1999);
    expect(exactLineTotal(inexactPerPiece, lots, 'piece', 30)).toBe(5997);
    // 1999 / 10 rounded per piece and multiplied back would give 6000.
    expect(exactLineTotal(inexactPerPiece, lots, 'piece', 30)).not.toBe(6000);
  });

  it('multiplies the pack and box prices by the quantity', () => {
    expect(exactLineTotal(inexactPerPiece, packaged, 'pack', 3)).toBe(5997);
    expect(exactLineTotal(inexactPerPiece, packaged, 'box', 2)).toBe(15_992);
  });

  it('refuses a piece quantity that is not whole lots', () => {
    const lots = { piecesPerPack: 10, packsPerBox: null, minPieceQty: 10 };
    expect(exactLineTotal(inexactPerPiece, lots, 'piece', 15)).toBeNull();
  });

  it('refuses a unit the product is not sold in', () => {
    expect(exactLineTotal(inexactPerPiece, packOnly, 'box', 1)).toBeNull();
    expect(
      exactLineTotal({ ...inexactPerPiece, pack: null }, packaged, 'pack', 1),
    ).toBeNull();
  });

  it('refuses a missing piece price rather than pricing it at nothing', () => {
    expect(
      exactLineTotal(
        { ...inexactPerPiece, pieceLotMinor: null },
        packaged,
        'piece',
        6,
      ),
    ).toBeNull();
  });

  it('refuses a quantity that is not a positive integer', () => {
    expect(exactLineTotal(inexactPerPiece, packaged, 'pack', 0)).toBeNull();
    expect(exactLineTotal(inexactPerPiece, packaged, 'pack', 1.5)).toBeNull();
  });
});

describe('convertUnitQuantity', () => {
  it('converts down exactly', () => {
    // One box is four packs, or 24 pieces.
    expect(convertUnitQuantity(packaged, 'box', 'pack', 1)).toEqual({
      quantity: 4,
      exact: true,
    });
    expect(convertUnitQuantity(packaged, 'box', 'piece', 1)).toEqual({
      quantity: 24,
      exact: true,
    });
  });

  it('rounds up to a whole target unit and says it did', () => {
    // 10 pieces is one pack and a bit, so two packs.
    expect(convertUnitQuantity(packaged, 'piece', 'pack', 10)).toEqual({
      quantity: 2,
      exact: false,
    });
  });

  it('still corrects the piece minimum when converting down', () => {
    // A pack of 10 pieces against a minimum (and increment) of 100.
    expect(convertUnitQuantity(packOnly, 'pack', 'piece', 3)).toEqual({
      quantity: 100,
      exact: false,
    });
  });

  it('never converts to zero of the target unit', () => {
    expect(convertUnitQuantity(packaged, 'piece', 'box', 6)).toEqual({
      quantity: 1,
      exact: false,
    });
  });

  it('refuses a unit the product is not sold in', () => {
    expect(convertUnitQuantity(packOnly, 'pack', 'box', 1)).toBeNull();
    expect(convertUnitQuantity(plain, 'piece', 'pack', 1)).toBeNull();
  });
});
