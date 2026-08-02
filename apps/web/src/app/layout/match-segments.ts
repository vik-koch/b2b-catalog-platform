import { searchTerms } from '@b2b-catalog-platform/shared';

/** A run of a product name, flagged as matched or not. */
export interface NameSegment {
  text: string;
  match: boolean;
}

/**
 * Splits a suggested product name into the parts the query matched and the
 * parts it did not, so the template can embolden the former. Segments rather
 * than a marked-up string on purpose: product names are admin-editable
 * content, and turning content into markup to render it is how an editor's
 * text becomes an injection. Nothing here ever reaches `innerHTML`.
 *
 * Two things keep the highlight honest rather than merely decorative:
 *
 * - It is anchored to word starts, because the matcher's full-text half
 *   matches prefixes of words (`term:*`). Emboldening "es" inside "Reserve"
 *   would claim a match the search did not make.
 * - It only ever marks text the query literally contains. The matcher is
 *   typo-tolerant, so "espreso" legitimately returns *Hafen Espresso* with
 *   nothing to bold — that name is then returned as a single unmatched
 *   segment. Highlighting degrades to plain text; it never guesses.
 */
export function matchSegments(name: string, query: string): NameSegment[] {
  // Composed form throughout: offsets are computed on the folded copy and
  // applied to this string, so the two must agree on how an accented letter is
  // spelled. Rendering the composed form is visually identical.
  const source = name.normalize('NFC');
  const terms = searchTerms(query);
  if (!terms.length) return [{ text: source, match: false }];

  const folded = fold(source);
  const matched = new Array<boolean>(source.length).fill(false);

  for (const term of terms) {
    const needle = fold(term);
    if (!needle) continue;

    for (let at = folded.indexOf(needle); at >= 0; ) {
      if (startsWord(folded, at)) {
        matched.fill(true, at, at + needle.length);
      }
      at = folded.indexOf(needle, at + 1);
    }
  }

  return collapse(source, matched);
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
