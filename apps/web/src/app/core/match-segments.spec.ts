import { matchSegments } from './match-segments';

/** Reassembles the segments, so every case can assert that highlighting is
 * purely a partition of the name — nothing dropped, nothing invented. */
const rendered = (name: string, query: string) =>
  matchSegments(name, query)
    .map((s) => s.text)
    .join('');

/** The name with its matched runs wrapped, for readable expectations. */
const marked = (name: string, query: string) =>
  matchSegments(name, query)
    .map((s) => (s.match ? `[${s.text}]` : s.text))
    .join('');

describe('matchSegments', () => {
  it('marks the typed prefix of a name', () => {
    expect(marked('Hafen Espresso', 'hafen')).toBe('[Hafen] Espresso');
  });

  it('marks each word of a multi-word query, in whatever order they appear', () => {
    // Word-order independence is the matcher's promise (FR-SEARCH-02); the
    // highlight has to keep it or it contradicts the result it is explaining.
    expect(marked('Hafen Espresso', 'espresso hafen')).toBe(
      '[Hafen] [Espresso]',
    );
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
  ])('reproduces the name exactly — %s', (_label, name, query) => {
    expect(rendered(name, query)).toBe(name);
  });
});
