/**
 * The numeric reading of an attribute value. Parsed unconditionally for every
 * value that reads as a number, independent of any definition — that is what
 * lets a definition be retyped without rebuilding anything.
 *
 * Deliberately narrow: digits, an optional sign and one decimal point. A value
 * carrying its unit ("30 cm") is not a number, because the unit belongs on the
 * definition; "30 cm" and "30cm" would otherwise be two facets. Nothing is
 * refused — an unparseable value is stored and shown unchanged and only drops
 * out of numeric facets.
 */

/** Bound of the numeric column (18 digits, 6 of them after the point). */
export const ATTRIBUTE_NUMERIC_LIMIT = 1e12;

/** The pattern the database backfill mirrors. Keep the two in step. */
const NUMERIC_VALUE = /^[+-]?([0-9]+(\.[0-9]+)?|\.[0-9]+)$/;

/** The value's numeric form, or null when it does not read as a number. */
export function parseAttributeNumber(value: string): number | null {
  const trimmed = value.trim();
  if (!NUMERIC_VALUE.test(trimmed)) return null;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) return null;
  return Math.abs(parsed) < ATTRIBUTE_NUMERIC_LIMIT ? parsed : null;
}
