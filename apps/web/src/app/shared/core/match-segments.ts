import { searchTerms } from '@b2b-catalog-platform/shared';

/** A run of a suggested line, flagged as matched or not. */
export interface NameSegment {
  text: string;
  match: boolean;
}

/**
 * Splits a suggested line into the parts the query matched and the parts it did
 * not, so the template can mark the former. Segments rather than a marked-up
 * string on purpose: the lines are admin-editable content or a third party's
 * text, and turning either into markup to render it is how it becomes an
 * injection. Nothing here ever reaches `innerHTML`.
 *
 * Shared by every type-ahead that draws its own rows — the catalog search bar
 * and the address field — so one query highlights the same way wherever it is
 * typed.
 *
 * Two things keep the highlight honest rather than merely decorative:
 *
 * - It is anchored to word starts, because that is how the things behind these
 *   fields match: the catalog's full-text half matches prefixes of words
 *   (`term:*`), and an address provider matches a street by its beginning.
 *   Marking "es" inside "Reserve" would claim a match neither one made.
 * - It only ever marks text the query literally contains. Matching is
 *   typo-tolerant on both sides, so "espreso" legitimately returns *Hafen
 *   Espresso* with nothing to mark — that line is then returned as a single
 *   unmatched segment. Highlighting degrades to plain text; it never guesses.
 *
 * Within that, a hit is marked as the visitor typed it rather than letter run
 * by letter run. Each space-separated chunk of the query is looked for whole
 * first, punctuation included — product names are full of `3.5"`, `0,5 l`,
 * `(white)` and `2+1`, and marking the digits around a point but not the point
 * reads as two hits where there was one. Only a chunk that is not in the name
 * as typed falls back to its terms. And where two hits from different chunks
 * are separated by nothing but spaces and punctuation, the gap is marked too,
 * so "cup lid" over *Cup, lid* is one run and not two islands.
 *
 * `alternate` is the query read on a second keyboard layout (FR-SEARCH-08),
 * word for word. A word is marked in its other reading only where it marks
 * nothing as typed, as the matcher reads each word either way.
 */
export function matchSegments(
  name: string,
  query: string,
  alternate: string | null = null,
): NameSegment[] {
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
  // Which chunk marked each character, or -1 — the gap rule needs to know
  // whether two neighbouring hits came from one chunk or two.
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

/** Marks what lies between two hits from different chunks, where that is
 * only separators — spaces and punctuation, never a letter or a digit. One
 * chunk's own repeats are left apart: "cup" over *Cup - Cup* is two hits. */
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
 * Lower-cases and strips accents *without changing the string's length*, which
 * is what lets an offset found in the folded copy be applied to the original.
 * Any character whose folded form is not a single unit is left alone: it would
 * shift every offset after it, and a missed highlight is a far smaller defect
 * than one landing on the wrong letters. Sharp s and the ligatures are the
 * practical cases — the database's `unaccent` expands them, this does not, so
 * those names simply come back unhighlighted.
 */
function fold(text: string): string {
  return Array.from(text)
    .map((char) => {
      const folded = char.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
      return folded.length === char.length ? folded : char;
    })
    .join('');
}

/** Whether `at` begins a word — the start of the name, or preceded by anything
 * that is not a letter or a digit. Mirrors how the matcher treats a term. */
function startsWord(text: string, at: number): boolean {
  return at === 0 || /[^\p{L}\p{N}]/u.test(text[at - 1]);
}

/** Turns the per-character flags back into the fewest possible runs, so the
 * template renders one element per span rather than one per letter. */
function collapse(source: string, matched: boolean[]): NameSegment[] {
  const segments: NameSegment[] = [];

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
