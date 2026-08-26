import {
  availableUnits,
  basisDividesQuantities,
  correctPieces,
  exactLineTotal,
  LINE_PIECES_MAX,
  stepFrom,
  minimumIsWholeSteps,
  pieceFloor,
  piecePriceMilliMinor,
  piecesFromUnitQuantity,
  piecesPerUnit,
  pieceStep,
  ProductPackaging,
  stepPieces,
  totalMinor,
  unitQuantity,
  unitQuantityIsWhole,
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

describe('stepPieces', () => {
  it('moves a piece line by one pack', () => {
    expect(stepPieces(packaged, 'piece')).toBe(6);
    expect(stepPieces(packOnly, 'piece')).toBe(10);
  });

  it('moves a pack or a box line by one of itself', () => {
    expect(stepPieces(packaged, 'pack')).toBe(6);
    expect(stepPieces(packaged, 'box')).toBe(24);
  });

  // Otherwise a press through one lens would land the piece count between two
  // quantities another lens can express.
  it('is always a whole number of steps', () => {
    for (const unit of availableUnits(packaged)) {
      expect(stepPieces(packaged, unit) % pieceStep(packaged)).toBe(0);
    }
  });

  it('falls back to the step for a unit the product is not sold in', () => {
    expect(stepPieces(packOnly, 'box')).toBe(10);
  });
});

describe('stepFrom', () => {
  it('moves a whole reading by a whole one of the unit', () => {
    expect(stepFrom(packaged, 'box', 24, 1)).toBe(48);
    expect(stepFrom(packaged, 'box', 48, -1)).toBe(24);
    expect(stepFrom(packaged, 'pack', 6, 1)).toBe(12);
    expect(stepFrom(packaged, 'piece', 12, 1)).toBe(18);
  });

  // The reason this is not simply "add one step": `+` on a quarter of a box
  // should offer a box, not a box and a quarter.
  it('snaps a part unit to the whole one it is reaching for', () => {
    // Six pieces of a 24-piece box is a quarter of one.
    expect(stepFrom(packaged, 'box', 6, 1)).toBe(24);
    expect(stepFrom(packaged, 'box', 30, 1)).toBe(48);
  });

  it('snaps downward to the whole unit below', () => {
    expect(stepFrom(packaged, 'box', 30, -1)).toBe(24);
    // Nothing is below a quarter of a box but nothing at all; the floor is the
    // caller's business.
    expect(stepFrom(packaged, 'box', 6, -1)).toBe(0);
  });

  it('lands on a quantity the shop can pick, whichever unit pressed it', () => {
    for (const unit of availableUnits(packaged)) {
      for (const pieces of [6, 7, 23, 30]) {
        const up = stepFrom(packaged, unit, pieces, 1);
        expect(up % pieceStep(packaged)).toBe(0);
        expect(correctPieces(packaged, up)).toBe(up);
      }
    }
  });
});

describe('unitQuantityIsWhole', () => {
  it('is true up to the step, where a reading cannot be a fraction', () => {
    expect(unitQuantityIsWhole(packaged, 'piece')).toBe(true);
    expect(unitQuantityIsWhole(packaged, 'pack')).toBe(true);
    expect(unitQuantityIsWhole(plain, 'piece')).toBe(true);
  });

  it('is false for a box, which holds several steps', () => {
    expect(unitQuantityIsWhole(packaged, 'box')).toBe(false);
  });

  it('is true for a box of one pack, which holds exactly one', () => {
    expect(unitQuantityIsWhole({ ...packaged, packsPerBox: 1 }, 'box')).toBe(
      true,
    );
  });

  it('is true for a unit the product is not sold in', () => {
    expect(unitQuantityIsWhole(packOnly, 'box')).toBe(true);
  });
});

describe('pieceFloor', () => {
  it('is the stated minimum where that is already whole steps', () => {
    expect(pieceFloor(packOnly)).toBe(100);
    expect(pieceFloor(packaged)).toBe(6);
    expect(pieceFloor(plain)).toBe(1);
  });

  it('raises a minimum that sits between steps', () => {
    // Refused by products_minimum_is_whole_packs, so this is the belt to that
    // braces: a row that predates the rule still lands on the lattice.
    expect(pieceFloor({ ...packOnly, minPieceQty: 95 })).toBe(100);
  });

  // The rounding a lens used to need: a minimum of 24 read through a box of 24
  // was one box, and through a pack of six was four packs. Both are the same
  // 24 pieces, and that is now the only figure.
  it('is one figure, whatever lens it is read through', () => {
    const min24: ProductPackaging = { ...packaged, minPieceQty: 24 };
    expect(pieceFloor(min24)).toBe(24);
    expect(unitQuantity(min24, 'pack', pieceFloor(min24))).toBe(4);
    expect(unitQuantity(min24, 'box', pieceFloor(min24))).toBe(1);
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

describe('correctPieces', () => {
  // The change this rule went through: the minimum used to be the increment
  // too, so 140 against a minimum of 100 became 200. The pack is what cannot
  // be broken, so 140 is now simply 140 — fourteen whole packs of ten, above a
  // minimum of a hundred.
  it('rounds up to the next whole pack, never down', () => {
    expect(correctPieces(packOnly, 101)).toBe(110);
    expect(correctPieces(packOnly, 199)).toBe(200);
    expect(correctPieces(packaged, 13)).toBe(18);
  });

  it('leaves an already-valid quantity alone', () => {
    expect(correctPieces(packOnly, 100)).toBe(100);
    expect(correctPieces(packOnly, 140)).toBe(140);
    expect(correctPieces(packaged, 12)).toBe(12);
  });

  it('lifts anything at or below the minimum to the minimum', () => {
    expect(correctPieces(packOnly, 1)).toBe(100);
    expect(correctPieces(packOnly, 0)).toBe(100);
    expect(correctPieces(packOnly, -5)).toBe(100);
  });

  it('stops at the minimum rather than at one pack', () => {
    // The two figures are different things: 90 is nine whole packs and still
    // below what the shop will ship.
    expect(correctPieces(packOnly, 90)).toBe(100);
  });

  // The one place it rounds down, because up is nowhere: past the ceiling a
  // line is no longer an order the contract will carry. Through a box lens a
  // four-digit figure reaches it, so it is a typing accident within reach.
  it('comes back down to the ceiling, and lands on the lattice doing it', () => {
    const capped = correctPieces(packaged, LINE_PIECES_MAX * 2);
    expect(capped).toBeLessThanOrEqual(LINE_PIECES_MAX);
    expect(capped % pieceStep(packaged)).toBe(0);
    expect(correctPieces(packaged, capped)).toBe(capped);
  });

  // Raising rounds up, so a figure under the ceiling can be lifted over it —
  // which is why the ceiling is checked against the raised figure.
  it('does not raise a quantity past the ceiling', () => {
    // 24 does not divide the ceiling, so the last whole box below it is short.
    const justUnder = LINE_PIECES_MAX - 1;
    expect(correctPieces(packaged, justUnder)).toBeLessThanOrEqual(
      LINE_PIECES_MAX,
    );
  });

  it('is a no-op where there is neither a minimum nor a pack', () => {
    expect(correctPieces(plain, 1)).toBe(1);
    expect(correctPieces(plain, 137)).toBe(137);
  });
});

describe('unitQuantity', () => {
  it('reads a piece count out through the chosen lens', () => {
    expect(unitQuantity(packaged, 'piece', 24)).toBe(24);
    expect(unitQuantity(packaged, 'pack', 24)).toBe(4);
    expect(unitQuantity(packaged, 'box', 24)).toBe(1);
  });

  // The change this whole model is: two packs of a ten-pack box used to have to
  // become a whole box.
  it('reads a part box as the fraction it is', () => {
    const tenPackBox: ProductPackaging = {
      piecesPerPack: 6,
      packsPerBox: 10,
      minPieceQty: 6,
    };
    expect(unitQuantity(tenPackBox, 'box', 12)).toBe(0.2);
    expect(unitQuantity(tenPackBox, 'box', 6)).toBe(0.1);
  });

  it('rounds the reading to three decimals and nothing else', () => {
    const fortyPackBox: ProductPackaging = {
      piecesPerPack: 1,
      packsPerBox: 40,
      minPieceQty: 1,
    };
    expect(unitQuantity(fortyPackBox, 'box', 1)).toBe(0.025);
    // A seventh of a box does not terminate; the reading is what is rounded,
    // never the pieces.
    expect(unitQuantity({ ...fortyPackBox, packsPerBox: 7 }, 'box', 1)).toBe(
      0.143,
    );
  });

  it('is null for a unit the product is not sold in', () => {
    expect(unitQuantity(packOnly, 'box', 100)).toBeNull();
    expect(unitQuantity(plain, 'pack', 1)).toBeNull();
  });
});

describe('piecesFromUnitQuantity', () => {
  it('is the inverse of the reading for a quantity that lands on pieces', () => {
    expect(piecesFromUnitQuantity(packaged, 'box', 1)).toBe(24);
    expect(piecesFromUnitQuantity(packaged, 'pack', 3)).toBe(18);
    expect(piecesFromUnitQuantity(packaged, 'piece', 12)).toBe(12);
  });

  it('accepts a fraction of a box that is whole packs', () => {
    const tenPackBox: ProductPackaging = {
      piecesPerPack: 6,
      packsPerBox: 10,
      minPieceQty: 6,
    };
    expect(piecesFromUnitQuantity(tenPackBox, 'box', 0.2)).toBe(12);
  });

  it('rounds up to a whole piece, leaving the lattice to correctPieces', () => {
    const tenPackBox: ProductPackaging = {
      piecesPerPack: 6,
      packsPerBox: 10,
      minPieceQty: 6,
    };
    // 0.25 bx is fifteen pieces, which is two and a half packs; correcting
    // takes it to three, and reads back as 0.3 bx.
    expect(piecesFromUnitQuantity(tenPackBox, 'box', 0.25)).toBe(15);
    expect(correctPieces(tenPackBox, 15)).toBe(18);
    expect(unitQuantity(tenPackBox, 'box', 18)).toBe(0.3);
  });

  // 0.3 × 240 is 72.00000000000001 in binary, and a ceiling over that buys a
  // piece nobody asked for.
  it('does not buy a piece to binary rounding', () => {
    const bigBox: ProductPackaging = {
      piecesPerPack: 24,
      packsPerBox: 10,
      minPieceQty: 24,
    };
    expect(piecesFromUnitQuantity(bigBox, 'box', 0.3)).toBe(72);
  });

  it('never reaches zero, however small the figure', () => {
    expect(piecesFromUnitQuantity(packaged, 'box', 0.001)).toBe(1);
  });

  it('is null for a unit the product is not sold in', () => {
    expect(piecesFromUnitQuantity(packOnly, 'box', 1)).toBeNull();
    expect(piecesFromUnitQuantity(plain, 'pack', 1)).toBeNull();
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
  // quantity does. The lot is the pack of ten.
  const inexactPerPiece = {
    pieceLotMinor: 1999,
    pack: 1999,
    box: 7996,
  };
  const lots: ProductPackaging = {
    piecesPerPack: 10,
    packsPerBox: 4,
    minPieceQty: 10,
  };

  it('multiplies whole lots, never the per-piece figure', () => {
    expect(exactLineTotal(inexactPerPiece, lots, 10)).toBe(1999);
    expect(exactLineTotal(inexactPerPiece, lots, 30)).toBe(5997);
    // 1999 / 10 rounded per piece and multiplied back would give 6000.
    expect(exactLineTotal(inexactPerPiece, lots, 30)).not.toBe(6000);
  });

  // The lens cannot change what a quantity costs: half a box of these is two
  // packs, and two packs is what it is charged as.
  it('prices a part box as the packs it is', () => {
    expect(exactLineTotal(inexactPerPiece, lots, 20)).toBe(3998);
    expect(exactLineTotal(inexactPerPiece, lots, 40)).toBe(inexactPerPiece.box);
  });

  it('refuses a quantity that is not whole lots', () => {
    expect(exactLineTotal(inexactPerPiece, lots, 15)).toBeNull();
  });

  it('refuses a missing lot price rather than pricing it at nothing', () => {
    expect(
      exactLineTotal({ ...inexactPerPiece, pieceLotMinor: null }, lots, 10),
    ).toBeNull();
  });

  it('refuses a quantity that is not a positive integer', () => {
    expect(exactLineTotal(inexactPerPiece, lots, 0)).toBeNull();
    expect(exactLineTotal(inexactPerPiece, lots, 1.5)).toBeNull();
  });
});
