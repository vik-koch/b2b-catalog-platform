import { searchTerms } from '@b2b-catalog-platform/shared/core/catalog';
import { HighlightSegment } from '@b2b-catalog-platform/ui/suggest/highlighted-line';

/**
 * Splits a line into the runs the query matched and the rest, by the rules the
 * search matchers use. Segments, not markup: the line is someone else's text,
 * and markup from it is an injection.
 *
 * - Anchored to word starts, as the matchers behind the fields match prefixes.
 * - Only text the query literally contains: a typo-tolerant hit with nothing
 *   literal comes back as one unmatched segment.
 * - Each space-separated chunk is tried whole first, punctuation included
 *   (`3.5"`, `0,5 l`), then term by term.
 * - A gap of only spaces and punctuation between hits of two chunks is marked
 *   too, so "cup lid" over "Cup, lid" is one run.
 * - `alternate` is the query on a second keyboard layout, word for word; a
 *   word is marked in that reading only where it marks nothing as typed.
 */
export function matchSegments(
  name: string,
  query: string,
  alternate: string | null = null,
): HighlightSegment[] {
  // Composed form throughout: offsets are computed on the folded copy and
  // applied to this string, so the two must agree on how an accented letter is
  // spelled. Rendering the composed form is visually identical.
  const source = name.normalize('NFC');
  const words = (text: string) =>
    text
      .normalize('NFC')
      .split(/\s+/u)
      .map((chunk) => fold(chunk));
  // Whitespace is never remapped, so the two split into the same words.
  const others = alternate === null ? [] : words(alternate);
  const chunks = words(query)
    .map((chunk, i) => [chunk, others[i] ?? ''])
    .filter((pair) => pair.some((chunk) => searchTerms(chunk).length > 0));
  if (!chunks.length) return [{ text: source, match: false }];

  const folded = fold(source);
  // Which chunk marked each character, or -1: the gap rule bridges only
  // between two chunks.
  const owner = new Array<number>(source.length).fill(-1);

  chunks.forEach((readings, index) => {
    // The first reading the name holds whole, or every term of; failing
    // both, whatever the typed one marks, as a query without a second reading.
    const full = readings.find((chunk) => holds(folded, chunk));
    markChunk(folded, full ?? readings[0], owner, index);
  });

  bridgeGaps(folded, owner);
  return collapse(
    source,
    owner.map((chunk) => chunk >= 0),
  );
}

/** Marks a chunk whole where the name has it as typed, else term by term. */
function markChunk(
  folded: string,
  chunk: string,
  owner: number[],
  index: number,
): void {
  if (markAll(folded, chunk, owner, index)) return;
  for (const term of searchTerms(chunk)) markAll(folded, term, owner, index);
}

/** Whether the name has the chunk whole, or every one of its terms. */
function holds(folded: string, chunk: string): boolean {
  const terms = searchTerms(chunk);
  return (
    terms.length > 0 &&
    (startsWordAt(folded, chunk) ||
      terms.every((term) => startsWordAt(folded, term)))
  );
}

function startsWordAt(folded: string, needle: string): boolean {
  for (let at = folded.indexOf(needle); at >= 0;) {
    if (startsWord(folded, at)) return true;
    at = folded.indexOf(needle, at + 1);
  }
  return false;
}

/** Marks every word-start occurrence of `needle` for `chunk`; says whether
 * there was one. */
function markAll(
  folded: string,
  needle: string,
  owner: number[],
  chunk: number,
): boolean {
  let found = false;
  for (let at = folded.indexOf(needle); at >= 0;) {
    if (startsWord(folded, at)) {
      owner.fill(chunk, at, at + needle.length);
      found = true;
    }
    at = folded.indexOf(needle, at + 1);
  }
  return found;
}

/** Bridges separator-only gaps between hits of different chunks; one chunk's
 * own repeats stay apart ("cup" over "Cup - Cup" is two hits). */
function bridgeGaps(folded: string, owner: number[]): void {
  let lastEnd = -1;
  for (let i = 0; i < owner.length; i++) {
    if (owner[i] < 0) continue;
    if (
      lastEnd >= 0 &&
      i > lastEnd + 1 &&
      owner[lastEnd] !== owner[i] &&
      !/[\p{L}\p{N}]/u.test(folded.slice(lastEnd + 1, i))
    ) {
      owner.fill(owner[i], lastEnd + 1, i);
    }
    lastEnd = i;
  }
}

/**
 * Lower-cases and strips accents without changing the length, so an offset in
 * the folded copy applies to the original. A character that folds to more than
 * one unit (sharp s, ligatures) is left alone: a missed highlight beats one on
 * the wrong letters.
 */
function fold(text: string): string {
  return Array.from(text)
    .map((char) => {
      const folded = char.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
      return folded.length === char.length ? folded : char;
    })
    .join('');
}

/** Whether `at` begins a word: the start, or after a non-letter, non-digit. */
function startsWord(text: string, at: number): boolean {
  return at === 0 || /[^\p{L}\p{N}]/u.test(text[at - 1]);
}

/** The per-character flags as the fewest runs: one element per run, not per
 * letter. */
function collapse(source: string, matched: boolean[]): HighlightSegment[] {
  const segments: HighlightSegment[] = [];

  for (let i = 0; i < source.length; i++) {
    const last = segments[segments.length - 1];
    if (last && last.match === matched[i]) {
      last.text += source[i];
    } else {
      segments.push({ text: source[i], match: matched[i] });
    }
  }

  return segments;
}
