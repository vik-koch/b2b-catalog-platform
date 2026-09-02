import { readGridWidths, writeGridWidths } from './grid-widths';

const file = (grids: Record<string, Record<string, number>>) =>
  JSON.stringify({ v: 1, grids });

describe('stored grid widths', () => {
  it('reads the widths for one grid as fractions of the table', () => {
    const raw = file({ orders: { a: 0.25, b: 0.75 } });

    expect(readGridWidths(raw, 'orders', ['a', 'b'])).toEqual({
      a: 0.25,
      b: 0.75,
    });
  });

  // Hand-editable, and a file whose numbers do not add up would leave a table
  // narrower or wider than the room it has.
  it('normalises whatever it finds', () => {
    const raw = file({ orders: { a: 1, b: 3 } });

    expect(readGridWidths(raw, 'orders', ['a', 'b'])).toEqual({
      a: 0.25,
      b: 0.75,
    });
  });

  /*
   * A release that adds, drops or renames a column leaves widths that no longer
   * describe the table. Measuring the content again gives a better answer than
   * guessing at the missing column, so a set that is not exactly this grid's is
   * refused whole — which is also what tells the customers list from the staff
   * list, one component with two column sets.
   */
  it('refuses a set of keys that is not the grid it is asked about', () => {
    const raw = file({ orders: { a: 0.5, b: 0.5 } });

    expect(readGridWidths(raw, 'orders', ['a', 'b', 'c'])).toBeNull();
    expect(readGridWidths(raw, 'orders', ['a'])).toBeNull();
    expect(readGridWidths(raw, 'orders', ['a', 'renamed'])).toBeNull();
    expect(readGridWidths(raw, 'users-staff', ['a', 'b'])).toBeNull();
  });

  it('refuses a width that is not a positive number', () => {
    expect(readGridWidths(file({ g: { a: 0, b: 1 } }), 'g', ['a', 'b'])).toBe(
      null,
    );
    expect(readGridWidths(file({ g: { a: -1, b: 2 } }), 'g', ['a', 'b'])).toBe(
      null,
    );
  });

  it('reads nothing out of junk, a missing file or an older version', () => {
    expect(readGridWidths(null, 'g', ['a'])).toBeNull();
    expect(readGridWidths('not json', 'g', ['a'])).toBeNull();
    expect(readGridWidths('{"v":0,"grids":{}}', 'g', ['a'])).toBeNull();
  });

  it('replaces one grid and leaves the others alone', () => {
    const raw = file({ orders: { a: 0.5, b: 0.5 }, products: { x: 1 } });

    const written = writeGridWidths(raw, 'orders', { a: 0.2, b: 0.8 });

    expect(JSON.parse(written)).toEqual({
      v: 1,
      grids: { orders: { a: 0.2, b: 0.8 }, products: { x: 1 } },
    });
  });

  it('drops one grid on reset, so the next render measures again', () => {
    const raw = file({ orders: { a: 0.5, b: 0.5 }, products: { x: 1 } });

    expect(JSON.parse(writeGridWidths(raw, 'orders', null))).toEqual({
      v: 1,
      grids: { products: { x: 1 } },
    });
  });
});
