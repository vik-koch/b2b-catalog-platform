import {
  applyPastedGrid,
  clearRange,
  parseClipboardGrid,
  selectionToTsv,
} from './attribute-grid';

describe('parseClipboardGrid', () => {
  it('parses a tab/newline grid', () => {
    expect(parseClipboardGrid('a\tb\nc\td')).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
  });

  it('drops blank lines between rows (the contenteditable copy artifact)', () => {
    // Copying our own cells serialises blank lines between rows; they must not
    // become empty rows on paste.
    expect(parseClipboardGrid('a\tb\n\n\n\nc\td')).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
  });

  it('normalises CRLF and a trailing newline', () => {
    expect(parseClipboardGrid('a\tb\r\nc\td\r\n')).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
  });
});

describe('applyPastedGrid', () => {
  it('fills outward from the start cell, appending rows', () => {
    expect(
      applyPastedGrid(
        [{ key: 'k', value: 'v' }],
        { row: 0, col: 0 },
        [
          ['a', 'b'],
          ['c', 'd'],
        ],
        100,
      ),
    ).toEqual([
      { key: 'a', value: 'b' },
      { key: 'c', value: 'd' },
    ]);
  });

  it('respects the start column (paste into the value column)', () => {
    expect(
      applyPastedGrid(
        [{ key: 'k', value: 'v' }],
        { row: 0, col: 1 },
        [['x']],
        100,
      ),
    ).toEqual([{ key: 'k', value: 'x' }]);
  });

  it('caps row growth at the maximum', () => {
    expect(
      applyPastedGrid([], { row: 0, col: 0 }, [['a'], ['b'], ['c']], 2),
    ).toHaveLength(2);
  });

  it('trims cell values and does not mutate the input', () => {
    const rows = [{ key: '', value: '' }];
    const out = applyPastedGrid(
      rows,
      { row: 0, col: 0 },
      [[' a ', '  b']],
      100,
    );
    expect(out).toEqual([{ key: 'a', value: 'b' }]);
    expect(rows).toEqual([{ key: '', value: '' }]);
  });
});

describe('selectionToTsv', () => {
  const rows = [
    { key: 'k1', value: 'v1' },
    { key: 'k2', value: 'v2' },
  ];

  it('serialises a 2x2 selection', () => {
    expect(selectionToTsv(rows, { r0: 0, c0: 0, r1: 1, c1: 1 })).toBe(
      'k1\tv1\nk2\tv2',
    );
  });

  it('serialises a single column (keys only)', () => {
    expect(selectionToTsv(rows, { r0: 0, c0: 0, r1: 1, c1: 0 })).toBe('k1\nk2');
  });
});

describe('clearRange', () => {
  it('blanks every cell in the rectangle', () => {
    expect(
      clearRange(
        [
          { key: 'a', value: 'b' },
          { key: 'c', value: 'd' },
        ],
        { r0: 0, c0: 0, r1: 1, c1: 1 },
      ),
    ).toEqual([
      { key: '', value: '' },
      { key: '', value: '' },
    ]);
  });

  it('clears only the value column when selected alone', () => {
    expect(
      clearRange([{ key: 'a', value: 'b' }], { r0: 0, c0: 1, r1: 0, c1: 1 }),
    ).toEqual([{ key: 'a', value: '' }]);
  });
});
