import {
  formatPartList,
  isValidPartList,
  joinAttributeKey,
  parsePartList,
  splitAttributeKey,
  strayPart,
} from './product-parts';

describe('splitAttributeKey', () => {
  const parts = ['cup', 'lid'];

  it('reads a declared part out of the key', () => {
    expect(splitAttributeKey('Colour (cup)', parts)).toEqual({
      key: 'Colour',
      part: 'cup',
    });
  });

  it('tolerates the spacing a hand-typed key has', () => {
    expect(splitAttributeKey('  Colour(lid) ', parts)).toEqual({
      key: 'Colour',
      part: 'lid',
    });
    expect(splitAttributeKey('Colour ( lid )', parts)).toEqual({
      key: 'Colour',
      part: 'lid',
    });
  });

  it('leaves a parenthesis naming no part in the key', () => {
    // "Volume (ml)" is a key in its own right; merging it into "Volume" is
    // not the split's call.
    expect(splitAttributeKey('Volume (ml)', parts)).toEqual({
      key: 'Volume (ml)',
      part: null,
    });
  });

  it('matches a part exactly, so a wrong case stays visible', () => {
    expect(splitAttributeKey('Colour (Cup)', parts).part).toBeNull();
  });

  it('splits nothing for a product sold as itself', () => {
    expect(splitAttributeKey('Colour (cup)', [])).toEqual({
      key: 'Colour (cup)',
      part: null,
    });
  });

  it('needs a name before the parenthesis', () => {
    expect(splitAttributeKey('(cup)', parts)).toEqual({
      key: '(cup)',
      part: null,
    });
  });

  it('round-trips through joinAttributeKey', () => {
    expect(joinAttributeKey(splitAttributeKey('Colour(cup)', parts))).toBe(
      'Colour (cup)',
    );
    expect(joinAttributeKey({ key: 'Material', part: null })).toBe('Material');
  });
});

describe('strayPart', () => {
  it('names a parenthesis that is none of the parts', () => {
    expect(strayPart('Colour (Cup)', ['cup', 'lid'])).toEqual({
      key: 'Colour',
      part: 'Cup',
    });
  });

  it('is null for a declared part, or a key with no parenthesis', () => {
    expect(strayPart('Colour (cup)', ['cup', 'lid'])).toBeNull();
    expect(strayPart('Colour', ['cup', 'lid'])).toBeNull();
  });
});

describe('part lists', () => {
  it('parse from the editor field and format back', () => {
    expect(parsePartList(' cup +lid+ ')).toEqual(['cup', 'lid']);
    expect(formatPartList(['cup', 'lid'])).toBe('cup + lid');
    expect(parsePartList('')).toEqual([]);
  });

  it('are valid empty, or with two to three distinct parts', () => {
    expect(isValidPartList([])).toBe(true);
    expect(isValidPartList(['cup', 'lid'])).toBe(true);
    expect(isValidPartList(['cup', 'lid', 'straw'])).toBe(true);

    expect(isValidPartList(['cup'])).toBe(false);
    expect(isValidPartList(['a', 'b', 'c', 'd'])).toBe(false);
    expect(isValidPartList(['cup', 'cup'])).toBe(false);
  });

  it('refuse the characters a key names a part with', () => {
    expect(isValidPartList(['cup (large)', 'lid'])).toBe(false);
    expect(isValidPartList(['cup', ''])).toBe(false);
    expect(isValidPartList(['x'.repeat(41), 'lid'])).toBe(false);
  });
});
