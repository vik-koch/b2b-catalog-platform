import { fitWidths, measuredWidths, resizeBoundary } from './grid-resize';

const keys = ['a', 'b', 'c'];
const mins = [40, 40, 40];
const even = { a: 1 / 3, b: 1 / 3, c: 1 / 3 };

describe('resizing a column boundary', () => {
  // The table always fills its container: what one column gains, its neighbour
  // gives up, so no grid ever grows a scrollbar out of a drag.
  it('moves width from one column to the one beside it', () => {
    const next = resizeBoundary(even, keys, 0, 30, 300, mins);

    expect(next['a'] * 300).toBeCloseTo(130);
    expect(next['b'] * 300).toBeCloseTo(70);
    expect(next['c']).toBe(even['c']);
    expect(next['a'] + next['b'] + next['c']).toBeCloseTo(1);
  });

  it('stops where the column being squeezed would reach its minimum', () => {
    const next = resizeBoundary(even, keys, 0, 900, 300, [40, 60, 40]);

    expect(next['a'] * 300).toBeCloseTo(140);
    expect(next['b'] * 300).toBeCloseTo(60);
  });

  it('stops the same way when dragged the other direction', () => {
    const next = resizeBoundary(even, keys, 0, -900, 300, [40, 60, 40]);

    expect(next['a'] * 300).toBeCloseTo(40);
    expect(next['b'] * 300).toBeCloseTo(160);
  });

  it('leaves the widths alone at the last column, which owns no boundary', () => {
    expect(resizeBoundary(even, keys, 2, 30, 300, mins)).toBe(even);
  });

  it('leaves them alone before the table has been laid out', () => {
    expect(resizeBoundary(even, keys, 0, 30, 0, mins)).toBe(even);
  });
});

describe('measured widths', () => {
  it('turns what the browser laid out into fractions', () => {
    expect(measuredWidths(keys, [100, 200, 100])).toEqual({
      a: 0.25,
      b: 0.5,
      c: 0.25,
    });
  });

  // A table that has not been laid out yet — no rows, or not on screen — is not
  // a measurement, and freezing it would keep the columns at their headings.
  it('measures nothing from a table with no width', () => {
    expect(measuredWidths(keys, [0, 0, 0])).toBeNull();
    expect(measuredWidths(keys, [100, 100])).toBeNull();
  });
});

describe('fitting the measured widths to the room there is', () => {
  const mins = [80, 110, 110];

  it('leaves widths that already fit, as shares of the table', () => {
    expect(fitWidths(keys, [200, 150, 150], mins, 500)).toEqual({
      a: 0.4,
      b: 0.3,
      c: 0.3,
    });
  });

  /*
   * A heading holding a filter is a `w-full` select and contributes nothing to
   * the width the browser derives, so those columns measure as if they had no
   * heading. Raised to their minimum, and the room comes from the columns that
   * have some to give rather than from every column alike — which is what used
   * to squeeze the raised ones straight back under their minimum.
   */
  it('raises a column to its minimum at the expense of the ones with slack', () => {
    const fitted = fitWidths(keys, [300, 40, 40], mins, 400) ?? {};

    expect(fitted['a'] * 400).toBeCloseTo(180, 0);
    expect(fitted['b'] * 400).toBeCloseTo(110, 0);
    expect(fitted['c'] * 400).toBeCloseTo(110, 0);
  });

  // Nothing left to give: the minimums are kept and the table is left wider
  // than its container, which the grid's own min-width lets it scroll.
  it('keeps the minimums when even those do not fit', () => {
    const fitted = fitWidths(keys, [80, 110, 110], mins, 200);

    expect(fitted).toEqual(measuredWidths(keys, [80, 110, 110]));
  });
});
