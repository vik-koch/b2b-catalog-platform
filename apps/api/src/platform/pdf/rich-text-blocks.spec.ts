import { richTextBlocks } from './rich-text-blocks';

describe('richTextBlocks', () => {
  it('reads headings and paragraphs in order, keeping bold', () => {
    expect(
      richTextBlocks(
        '<h2>Returns</h2><p>Within <strong>14 days</strong>, unopened.</p>',
      ),
    ).toEqual([
      { kind: 'heading', level: 2, runs: [{ text: 'Returns', bold: false }] },
      {
        kind: 'text',
        indent: 0,
        runs: [
          { text: 'Within ', bold: false },
          { text: '14 days', bold: true },
          { text: ', unopened.', bold: false },
        ],
      },
    ]);
  });

  // The editor wraps an item's text in a paragraph; the marker still hangs
  // beside its first line, and a nested list steps in once more.
  it('hangs a marker beside each list item, nested lists further in', () => {
    const blocks = richTextBlocks(
      '<ol><li><p>First</p><ul><li><p>Inner</p></li></ul></li><li>Second</li></ol>',
    );

    expect(
      blocks.map((block) =>
        block.kind === 'text'
          ? [block.marker, block.indent, block.runs]
          : block.kind,
      ),
    ).toEqual([
      ['1.', 18, [{ text: 'First', bold: false }]],
      ['•', 36, [{ text: 'Inner', bold: false }]],
      ['2.', 18, [{ text: 'Second', bold: false }]],
    ]);
  });

  // A printed link cannot be followed, so its address is printed beside it —
  // but not twice where the words already are the address.
  it('prints a link’s address beside its words', () => {
    const [mailed, shown] = richTextBlocks(
      '<p>Write to <a href="mailto:shop@example.com">us</a>.</p>' +
        '<p><a href="https://example.com">https://example.com</a></p>',
    );

    expect(mailed).toMatchObject({
      runs: [
        { text: 'Write to ' },
        { text: 'us' },
        { text: ' (shop@example.com)' },
        { text: '.' },
      ],
    });
    expect(shown).toMatchObject({
      runs: [{ text: 'https://example.com' }],
    });
  });

  it('keeps a line break, draws a rule and leaves images out', () => {
    expect(
      richTextBlocks(
        '<p>Street 1<br>Town</p><hr><p><img src="/media/x.png"></p>',
      ),
    ).toEqual([
      {
        kind: 'text',
        indent: 0,
        runs: [
          { text: 'Street 1', bold: false },
          { break: true },
          { text: 'Town', bold: false },
        ],
      },
      { kind: 'rule' },
    ]);
  });
});
