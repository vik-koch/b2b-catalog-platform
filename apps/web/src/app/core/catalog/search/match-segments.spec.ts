import { matchSegments } from './match-segments';

/** Reassembles the segments, so every case can assert that highlighting is
 * purely a partition of the name — nothing dropped, nothing invented. */
const rendered = (name: string, query: string) =>
  matchSegments(name, query)
    .map((s) => s.text)
    .join('');

/** The name with its matched runs wrapped, for readable expectations. */
const marked = (name: string, query: string, alternate: string | null = null) =>
  matchSegments(name, query, alternate)
    .map((s) => (s.match ? `[${s.text}]` : s.text))
    .join('');

describe('matchSegments', () => {
  it('marks the typed prefix of a name', () => {
    expect(marked('Hafen Espresso', 'hafen')).toBe('[Hafen] Espresso');
  });

  it('marks each word of a multi-word query, in whatever order they appear', () => {
    // Word-order independence is the matcher's promise (FR-SEARCH-02); the
    // highlight has to keep it or it contradicts the result it is explaining.
    expect(marked('Hafen Espresso', 'espresso hafen')).toBe('[Hafen Espresso]');
  });

  it('marks a partial word as far as it was typed', () => {
    expect(marked('Kontor Hand Grinder', 'grinde')).toBe(
      'Kontor Hand [Grinde]r',
    );
  });

  it('marks a term everywhere it starts a word', () => {
    expect(marked('Kontor Grind One Kontor', 'kontor')).toBe(
      '[Kontor] Grind One [Kontor]',
    );
  });

  it('ignores accents, matching the way the database folds them', () => {
    // "kaicafe" finds Kaicafé Bar, so it must also highlight it — and the
    // offsets have to survive the fold or the bold lands a letter early.
    expect(marked('Kaicafé Bar', 'kaicafe')).toBe('[Kaicafé] Bar');
  });

  it('marks nothing when the query only matched through a typo', () => {
    // The matcher is fuzzy and this highlighter is not: "espreso" ranks this
    // product first, and there is no honest span to embolden.
    expect(marked('Hafen Espresso', 'espreso')).toBe('Hafen Espresso');
  });

  it('does not mark the middle of a word', () => {
    // The full-text half matches word prefixes, so "res" is not a match
    // against "Barista" — emboldening it would claim one that was never made.
    expect(marked('Barista Reserve', 'res')).toBe('Barista [Res]erve');
  });

  it.each([
    ['a decimal point', 'Pipe 3.5 mm', '3.5', 'Pipe [3.5] mm'],
    ['a decimal comma', 'Cup 0,5 l', '0,5', 'Cup [0,5] l'],
    ['a quote mark', 'Hose 3/4" long', '3/4"', 'Hose [3/4"] long'],
    ['brackets', 'Cup (white)', '(white)', 'Cup [(white)]'],
    ['a plus and a star', 'Deal 2+1 *new*', '2+1 *new*', 'Deal [2+1 *new*]'],
    ['a hyphen', 'Lid A-4', 'a-4', 'Lid [A-4]'],
  ])(
    'marks %s the query typed as part of the hit',
    (_label, name, query, expected) => {
      // Names are full of these, and marking the digits either side of a point
      // but not the point reads as two hits where there was one.
      expect(marked(name, query)).toBe(expected);
    },
  );

  it('falls back to the terms where a chunk is not in the name as typed', () => {
    // The matcher ignores punctuation, so "3.5" also finds "3-5"; the
    // highlight marks what it literally can.
    expect(marked('Pipe 3-5 mm', '3.5')).toBe('Pipe [3]-[5] mm');
  });

  it('marks the spaces and punctuation between two words of the query', () => {
    expect(marked('Espresso Cup, lid', 'cup lid')).toBe('Espresso [Cup, lid]');
    expect(marked('Hafen Espresso', 'hafen espresso')).toBe('[Hafen Espresso]');
  });

  it('does not bridge a gap that holds a word', () => {
    expect(marked('Cup white lid', 'cup lid')).toBe('[Cup] white [lid]');
  });

  it('does not bridge between two repeats of the same word', () => {
    // One word found twice is two hits, not a phrase.
    expect(marked('Cup - Cup', 'cup')).toBe('[Cup] - [Cup]');
  });

  it('marks a word in its other-layout reading where it marks nothing as typed', () => {
    expect(marked('Yirgacheffe Filter', 'zirga filter', 'yirga filter')).toBe(
      '[Yirga]cheffe [Filter]',
    );
    expect(marked('Fährmann', "f'hrmann", 'fährmann')).toBe('[Fährmann]');
  });

  it('prefers the typed reading of a word that marks either way', () => {
    expect(marked('Yellow Zest', 'yel', 'zel')).toBe('[Yel]low Zest');
  });

  it('leaves the name whole when there is nothing to match on', () => {
    expect(marked('Hafen Espresso', '   ')).toBe('Hafen Espresso');
    expect(marked('Hafen Espresso', '!!!')).toBe('Hafen Espresso');
  });

  it.each([
    ['a plain name', 'Hafen Espresso', 'hafen'],
    ['punctuation in the name', "Crema d'Oro", 'crema oro'],
    ['a name with digits', 'Roastery No. 7', 'roastery 7'],
    ['an accented name', 'Kaicafé Bar', 'kaicafe'],
    ['a name the query cannot match', 'Nordic Pull', 'zzz'],
    ['a phrase with punctuation', 'Cup (white), 0,5 l', 'cup white 0,5'],
  ])('reproduces the name exactly — %s', (_label, name, query) => {
    expect(rendered(name, query)).toBe(name);
  });
});
