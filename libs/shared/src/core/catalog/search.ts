/**
 * Upper bound on a search query: longer than any real product query, short
 * enough that no caller can hand the matcher an expensive string. Refused at
 * the contract rather than truncated, so an over-long query is an explainable
 * 400 instead of a search for something else. The search bar caps its input at
 * the same number.
 */
export const SEARCH_QUERY_MAX_LENGTH = 100;

/**
 * How a search query is split into terms. The API tokenizes with it before
 * building a `tsquery`, and the search bar to decide what to highlight in a
 * suggestion; a highlighter that split differently would bold the wrong span.
 *
 * Splitting on everything that is not a letter or a digit is also what makes
 * the result safe to interpolate into a `tsquery`: no operator character
 * survives. Accents are kept: the API folds them in the database and the UI for
 * display, so this stays a pure string function.
 */
export function searchTerms(input: string): string[] {
  return input
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}
