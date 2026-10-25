import { PairingLine, pairingShortfalls } from './pairing-check';

/** Two products that are sold with each other, and nothing else. */
const pair = (a: number, b: number): PairingLine[] => [
  { slug: 'cup', pieces: a, paired: true, counterpartSlugs: ['lid'] },
  { slug: 'lid', pieces: b, paired: true, counterpartSlugs: ['cup'] },
];

describe('pairingShortfalls (FR-SET-02)', () => {
  it('says nothing about a cart with no pairings in it', () => {
    expect(
      pairingShortfalls([
        { slug: 'coffee', pieces: 12, paired: false, counterpartSlugs: [] },
        { slug: 'tea', pieces: 6, paired: false, counterpartSlugs: [] },
      ]),
    ).toEqual([]);
  });

  it('is satisfied when the two sides match', () => {
    expect(pairingShortfalls(pair(10, 10))).toEqual([]);
  });

  // The whole point of one rule read from both ends: only the side that is
  // actually short says anything. The lid's 80 are fully covered by the cup's
  // 100, so the lid has nothing to report.
  it('names only the side that is short', () => {
    expect(pairingShortfalls(pair(100, 80))).toEqual([
      { slug: 'cup', shortPieces: 20 },
    ]);
  });

  it('lets several counterparts answer one product between them', () => {
    // Six cups, three of each lid: the client's own case.
    expect(
      pairingShortfalls([
        {
          slug: 'cup',
          pieces: 6,
          paired: true,
          counterpartSlugs: ['flat', 'domed'],
        },
        { slug: 'flat', pieces: 3, paired: true, counterpartSlugs: ['cup'] },
        { slug: 'domed', pieces: 3, paired: true, counterpartSlugs: ['cup'] },
      ]),
    ).toEqual([]);
  });

  // The case `counterpartSlugs` alone cannot express: sold with something, and
  // none of it in the cart. Indistinguishable from a product sold alone unless
  // `paired` says so, and the two answers could not be further apart.
  it('is maximally short where no counterpart was added at all', () => {
    expect(
      pairingShortfalls([
        { slug: 'cup', pieces: 50, paired: true, counterpartSlugs: [] },
      ]),
    ).toEqual([{ slug: 'cup', shortPieces: 50 }]);
  });

  it('says nothing about a product that is simply sold alone', () => {
    expect(
      pairingShortfalls([
        { slug: 'coffee', pieces: 50, paired: false, counterpartSlugs: [] },
      ]),
    ).toEqual([]);
  });

  /**
   * The case a sum gets wrong, and the reason this is a flow. Both the cup and
   * the mug take the same lid, and each on its own has enough — but the lid's
   * ten pieces cannot cover twenty, and adding them up twice would call this
   * cart satisfied.
   */
  it('does not let one counterpart cover two products at once', () => {
    const shortfalls = pairingShortfalls([
      { slug: 'cup', pieces: 10, paired: true, counterpartSlugs: ['lid'] },
      { slug: 'mug', pieces: 10, paired: true, counterpartSlugs: ['lid'] },
      {
        slug: 'lid',
        pieces: 10,
        paired: true,
        counterpartSlugs: ['cup', 'mug'],
      },
    ]);

    // Ten pieces of cover are missing in total, whichever of the two is told.
    expect(shortfalls.reduce((sum, one) => sum + one.shortPieces, 0)).toBe(10);
    expect(shortfalls.map((one) => one.slug).sort()).not.toContain('lid');
  });

  it('answers the same cart the same way twice', () => {
    const lines: PairingLine[] = [
      { slug: 'cup', pieces: 10, paired: true, counterpartSlugs: ['lid'] },
      { slug: 'mug', pieces: 10, paired: true, counterpartSlugs: ['lid'] },
      {
        slug: 'lid',
        pieces: 10,
        paired: true,
        counterpartSlugs: ['cup', 'mug'],
      },
    ];

    expect(pairingShortfalls(lines)).toEqual(pairingShortfalls(lines));
  });

  // A counterpart in the catalog but not in the cart is simply absent: it
  // covers nothing, and the caller does not have to filter it out first.
  it('ignores a counterpart that is not in the cart', () => {
    expect(
      pairingShortfalls([
        {
          slug: 'cup',
          pieces: 10,
          paired: true,
          counterpartSlugs: ['lid', 'sleeve'],
        },
        { slug: 'lid', pieces: 10, paired: true, counterpartSlugs: ['cup'] },
      ]),
    ).toEqual([]);
  });

  it('reports the biggest shortfall first', () => {
    const shortfalls = pairingShortfalls([
      { slug: 'cup', pieces: 100, paired: true, counterpartSlugs: ['lid'] },
      { slug: 'lid', pieces: 1, paired: true, counterpartSlugs: ['cup'] },
      { slug: 'pot', pieces: 20, paired: true, counterpartSlugs: ['strainer'] },
      { slug: 'strainer', pieces: 5, paired: true, counterpartSlugs: ['pot'] },
    ]);

    expect(shortfalls).toEqual([
      { slug: 'cup', shortPieces: 99 },
      { slug: 'pot', shortPieces: 15 },
    ]);
  });

  /**
   * A chain, where covering one product uses up what another needed: A and C
   * both take B, and B takes both. Whatever the allocation, the cart is short
   * by the same total.
   */
  it('adds up the same however the cover is allocated', () => {
    const shortfalls = pairingShortfalls([
      { slug: 'a', pieces: 8, paired: true, counterpartSlugs: ['b'] },
      { slug: 'b', pieces: 6, paired: true, counterpartSlugs: ['a', 'c'] },
      { slug: 'c', pieces: 8, paired: true, counterpartSlugs: ['b'] },
    ]);

    // A and C want 16 between them and B has 6: ten short. B wants 6 and can
    // draw on 16, so B is covered.
    expect(shortfalls.reduce((sum, one) => sum + one.shortPieces, 0)).toBe(10);
    expect(shortfalls.map((one) => one.slug)).not.toContain('b');
  });
});
