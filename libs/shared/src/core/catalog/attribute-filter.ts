/**
 * How a facet selection travels between the storefront and the API
 * (FR-ATTR-07): one repeated `attr` parameter, each `<definition-slug>:<value>`,
 * split at the first colon. A value is freetext ("1,5" is a real one), so
 * nothing is packed into a single parameter; a slug never contains a colon.
 */

import { ATTRIBUTE_NAME_MAX_LENGTH } from './attributes';

/** Separates a definition's slug from the value it selects. */
const SEPARATOR = ':';

/**
 * Selected values in one request, across all attributes. Far above what the
 * filter panel produces: it stops a hand-written URL asking for unbounded
 * predicates.
 */
export const ATTRIBUTE_FILTER_MAX_PARAMS = 200;

/** A single value arrives as a bare string; both shapes are one list here. */
function toList(params: readonly string[] | string | undefined): string[] {
  if (params === undefined) return [];
  return typeof params === 'string' ? [params] : [...params];
}

/** One attribute's selected values, addressed by its definition slug. */
export interface AttributeSelection {
  slug: string;
  values: string[];
}

/** The `attr` parameters for a selection, one per selected value. */
export function encodeAttributeParams(
  selections: AttributeSelection[],
): string[] {
  return selections.flatMap(({ slug, values }) =>
    values.map((value) => `${slug}${SEPARATOR}${value}`),
  );
}

/**
 * The selection an `attr` list describes, in first-seen order, duplicates
 * collapsed. Malformed and empty entries are dropped rather than refused: a
 * shared link that lost a value must still open the listing.
 */
export function parseAttributeParams(
  params: readonly string[] | string | undefined,
): AttributeSelection[] {
  const bySlug = new Map<string, Set<string>>();

  for (const param of toList(params)) {
    const at = param.indexOf(SEPARATOR);
    if (at <= 0) continue;
    const slug = param.slice(0, at).trim();
    const value = param.slice(at + 1).trim();
    if (!slug || slug.length > ATTRIBUTE_NAME_MAX_LENGTH || !value) continue;

    const values = bySlug.get(slug) ?? new Set<string>();
    values.add(value);
    bySlug.set(slug, values);
  }

  return [...bySlug].map(([slug, values]) => ({ slug, values: [...values] }));
}
