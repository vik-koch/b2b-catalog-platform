/**
 * How a search query is split into terms. Lives here because two sides need
 * the identical rule: the API tokenizes with it before building a `tsquery`,
 * and the search bar tokenizes with it to decide which parts of a suggested
 * name to highlight. A highlighter that split differently from the matcher
 * would bold the wrong span — or nothing — on exactly the queries where the
 * two disagree.
 *
 * Splitting on everything that is not a letter or a digit is also what makes
 * the result safe to interpolate into a `tsquery`: no operator character can
 * survive tokenization. Accents are deliberately kept — the API folds them in
 * the database and the UI folds them for display, so both sides fold their own
 * side and this stays a pure string function.
 */
export function searchTerms(input: string): string[] {
  return input
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}
