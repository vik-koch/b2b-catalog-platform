import { changedProductFields, StoredOwnedProduct } from './owned-fields';

const stored: StoredOwnedProduct = {
  name: 'Blue mug',
  categoryId: '00000000-0000-0000-0000-0000000000c1',
  priceMinor: 1250,
  sourceId: 'ART-1',
  stockPieces: 40,
  tierPrices: [
    { tierId: '00000000-0000-0000-0000-0000000000t1', priceMinor: 1100 },
    { tierId: '00000000-0000-0000-0000-0000000000t2', priceMinor: 1000 },
  ],
};

/** A save that carries everything back unchanged — what the editor sends when
 * somebody edited only the description. */
const unchanged = () => ({
  name: stored.name,
  categoryId: stored.categoryId,
  priceMinor: stored.priceMinor,
  stockPieces: stored.stockPieces,
  tierPrices: [...stored.tierPrices],
});

describe('changedProductFields', () => {
  it('sees no write in a save that carries the stored values back', () => {
    // The whole point: the contract takes a whole product, so every save
    // carries the owned fields whether or not anybody touched them.
    expect(changedProductFields(stored, unchanged())).toEqual([]);
  });

  it('names each owned field that moved', () => {
    expect(
      changedProductFields(stored, { ...unchanged(), name: 'Red mug' }),
    ).toEqual(['name']);
    expect(
      changedProductFields(stored, { ...unchanged(), priceMinor: 1300 }),
    ).toEqual(['priceMinor']);
    expect(
      changedProductFields(stored, { ...unchanged(), stockPieces: 0 }),
    ).toEqual(['stockPieces']);
  });

  it('counts clearing the stock figure as a write', () => {
    // Null is "not tracked", which is a different statement from "none left"
    // — and the exchange is the one making it.
    expect(
      changedProductFields(stored, { ...unchanged(), stockPieces: null }),
    ).toEqual(['stockPieces']);
  });

  it('reports every field that moved, not just the first', () => {
    expect(
      changedProductFields(stored, {
        ...unchanged(),
        name: 'Red mug',
        priceMinor: 9,
      }),
    ).toEqual(['name', 'priceMinor']);
  });

  describe('sourceId', () => {
    it('is not a write when the save omits it', () => {
      // Omitted means "keep what is stored" — the server mints one only on
      // create — so an editor that does not offer the field is not refused.
      const { ...input } = unchanged();
      expect(changedProductFields(stored, input)).toEqual([]);
    });

    it('is not a write when the save carries the stored key back', () => {
      expect(
        changedProductFields(stored, { ...unchanged(), sourceId: 'ART-1' }),
      ).toEqual([]);
    });

    it('is a write when it names a different key', () => {
      // Retyping it does not edit this product; it points the exchange at a
      // stranger and orphans the row.
      expect(
        changedProductFields(stored, { ...unchanged(), sourceId: 'ART-2' }),
      ).toEqual(['sourceId']);
    });
  });

  describe('tier prices', () => {
    it('ignores the order they arrive in', () => {
      expect(
        changedProductFields(stored, {
          ...unchanged(),
          tierPrices: [...stored.tierPrices].reverse(),
        }),
      ).toEqual([]);
    });

    it('sees a changed override', () => {
      expect(
        changedProductFields(stored, {
          ...unchanged(),
          tierPrices: [
            { tierId: '00000000-0000-0000-0000-0000000000t1', priceMinor: 1 },
            stored.tierPrices[1],
          ],
        }),
      ).toEqual(['tierPrices']);
    });

    it('sees a dropped override', () => {
      // Dropping an entry returns that tier to the base price, which is a
      // price change made by omission.
      expect(
        changedProductFields(stored, {
          ...unchanged(),
          tierPrices: [stored.tierPrices[0]],
        }),
      ).toEqual(['tierPrices']);
    });

    it('sees an added override', () => {
      expect(
        changedProductFields(stored, {
          ...unchanged(),
          tierPrices: [
            ...stored.tierPrices,
            { tierId: '00000000-0000-0000-0000-0000000000t3', priceMinor: 900 },
          ],
        }),
      ).toEqual(['tierPrices']);
    });
  });
});
