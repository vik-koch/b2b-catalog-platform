import { productInputSchema } from './admin-catalog.contract';
import { PRODUCT_PAIRINGS_MAX } from './catalog-constants';

/** The minimum a product needs; packaging fields all have defaults. */
const base = {
  name: 'Hafen Espresso',
  priceMinor: 1999,
  categoryId: '11111111-1111-4111-8111-111111111111',
};

const parse = (input: Record<string, unknown>) =>
  productInputSchema.safeParse({ ...base, ...input });

describe('productInputSchema packaging', () => {
  it('defaults to a piece-only product priced per piece', () => {
    const result = parse({});

    expect(result.success).toBe(true);
    expect(result.success && result.data).toMatchObject({
      priceBasisPieces: 1,
      piecesPerPack: null,
      packsPerBox: null,
      minPieceQty: 1,
      boxVolume: null,
      boxWeight: null,
    });
  });

  it('accepts a basis that divides the minimum and the pack', () => {
    expect(
      parse({ priceBasisPieces: 10, piecesPerPack: 10, minPieceQty: 100 })
        .success,
    ).toBe(true);
  });

  it('refuses a basis that would leave a total needing rounding', () => {
    const result = parse({
      priceBasisPieces: 3,
      piecesPerPack: 10,
      minPieceQty: 10,
    });

    expect(result.success).toBe(false);
    expect(result.success === false && result.error.issues[0].path).toEqual([
      'priceBasisPieces',
    ]);
  });

  // The shape the constraint used to refuse: a shop selling one package of a
  // six-pack, which is a per-piece price and a minimum of one.
  it('accepts a minimum under one pack', () => {
    expect(
      parse({ piecesPerPack: 6, packsPerBox: 4, minPieceQty: 1 }).success,
    ).toBe(true);
  });

  it('refuses a minimum that sits across the pack', () => {
    const result = parse({ piecesPerPack: 6, minPieceQty: 8 });

    expect(result.success).toBe(false);
    expect(result.success === false && result.error.issues[0].path).toEqual([
      'minPieceQty',
    ]);
  });

  it('refuses a lot price where packs are opened, since the step is a piece', () => {
    const result = parse({
      priceBasisPieces: 2,
      piecesPerPack: 6,
      minPieceQty: 2,
    });

    expect(result.success).toBe(false);
    expect(result.success === false && result.error.issues[0].path).toEqual([
      'priceBasisPieces',
    ]);
  });

  it('refuses a box without a pack', () => {
    const result = parse({ packsPerBox: 4 });

    expect(result.success).toBe(false);
    expect(result.success === false && result.error.issues[0].path).toEqual([
      'packsPerBox',
    ]);
  });

  it('refuses box dimensions with no box to measure', () => {
    const result = parse({ boxWeight: '12.5' });

    expect(result.success).toBe(false);
  });

  it('takes dimensions as decimal strings, keeping the digits entered', () => {
    const result = parse({
      piecesPerPack: 6,
      packsPerBox: 4,
      minPieceQty: 6,
      boxVolume: '0.250',
      boxWeight: '12.500',
    });

    expect(result.success && result.data.boxVolume).toBe('0.250');
  });

  it('refuses a dimension with more precision than the column holds', () => {
    expect(
      parse({ piecesPerPack: 6, packsPerBox: 4, boxWeight: '1.2345' }).success,
    ).toBe(false);
  });

  it('refuses zero or fractional counts', () => {
    expect(parse({ piecesPerPack: 0 }).success).toBe(false);
    expect(parse({ minPieceQty: 1.5 }).success).toBe(false);
  });
});

describe('productInputSchema pairings', () => {
  it('defaults to no pairings', () => {
    const result = parse({});

    expect(result.success && result.data.pairedSlugs).toEqual([]);
  });

  it('refuses the same counterpart twice, since one pairing is one row', () => {
    const result = parse({ pairedSlugs: ['lid-small', 'lid-small'] });

    expect(result.success).toBe(false);
  });

  it('refuses more counterparts than a product is allowed', () => {
    const slugs = Array.from(
      { length: PRODUCT_PAIRINGS_MAX + 1 },
      (_, i) => `lid-${i}`,
    );

    expect(parse({ pairedSlugs: slugs }).success).toBe(false);
    expect(parse({ pairedSlugs: slugs.slice(1) }).success).toBe(true);
  });
});
