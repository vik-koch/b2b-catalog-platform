import * as z from 'zod';

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

/**
 * Longest attribute name we store — `attribute_definitions.name` and
 * `product_attributes.key` are the same text and share the cap.
 */
export const ATTRIBUTE_NAME_MAX_LENGTH = 200;

/** Longest attribute value we store (matches the `value` varchar). */
export const ATTRIBUTE_VALUE_MAX_LENGTH = 2000;

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

/**
 * How an attribute's values are read. `number` only decides ordering and
 * whether a value can appear in a facet at all — it is never a validator: an
 * unparseable value is still stored and displayed (FR-ATTR-03).
 */
export const ATTRIBUTE_TYPES = ['text', 'number'] as const;
export const attributeTypeSchema = z.enum(ATTRIBUTE_TYPES);
export type AttributeType = (typeof ATTRIBUTE_TYPES)[number];

/**
 * An attribute value as it should read on screen: the stored text, then the
 * definition's unit where there is one (FR-ATTR-01). One function because the
 * same pairing is needed in three places — the facet labels, the product
 * page's spec table and the admin's filter chips — and three copies would
 * drift on the first deployment that wants "30 cm" spaced differently.
 *
 * Never used to write a value back: the stored text is the unit-free half, and
 * the product editor's grid reads its cells straight from the DOM.
 */
export function formatAttributeValue(
  value: string,
  unit?: string | null,
): string {
  const trimmedUnit = unit?.trim();
  return trimmedUnit ? `${value} ${trimmedUnit}` : value;
}
