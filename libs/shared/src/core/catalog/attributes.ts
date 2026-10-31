/**
 * Matches `attribute_definitions.name` and `product_attributes.key`: the same
 * text, so one cap.
 */
export const ATTRIBUTE_NAME_MAX_LENGTH = 200;

/** Matches `product_attributes.value`. */
export const ATTRIBUTE_VALUE_MAX_LENGTH = 2000;

/** Bound of the numeric column (18 digits, 6 of them after the point). */
export const ATTRIBUTE_NUMERIC_LIMIT = 1e12;

/** The pattern the database backfill mirrors. Keep the two in step. */
const NUMERIC_VALUE = /^[+-]?([0-9]+(\.[0-9]+)?|\.[0-9]+)$/;

/**
 * The value's numeric form, or null. Parsed for every value whatever its
 * definition, so a definition can be retyped without rebuilding anything.
 *
 * Narrow on purpose: a value carrying its unit ("30 cm") is not a number: the
 * unit belongs on the definition. An unparseable value is still stored and
 * shown; it only drops out of numeric facets.
 */
export function parseAttributeNumber(value: string): number | null {
  const trimmed = value.trim();
  if (!NUMERIC_VALUE.test(trimmed)) return null;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) return null;
  return Math.abs(parsed) < ATTRIBUTE_NUMERIC_LIMIT ? parsed : null;
}

/**
 * How an attribute's values are read. `number` decides ordering and facets,
 * never validity (FR-ATTR-03).
 */
export const ATTRIBUTE_TYPES = ['text', 'number'] as const;
export type AttributeType = (typeof ATTRIBUTE_TYPES)[number];

/**
 * An attribute value as it reads on screen: the stored text, then the
 * definition's unit (FR-ATTR-01). The facet labels, the spec table and the
 * admin's filter chips all show it, so one spacing rule. Display only: the
 * stored value never carries the unit.
 */
export function formatAttributeValue(
  value: string,
  unit?: string | null,
): string {
  const trimmedUnit = unit?.trim();
  return trimmedUnit ? `${value} ${trimmedUnit}` : value;
}
