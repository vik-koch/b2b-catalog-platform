/** Matches the `attribute_definitions.unit` varchar. */
export const ATTRIBUTE_UNIT_MAX_LENGTH = 32;

/** No delete guard: a definition holds no data, so deleting it only stops the
 * attribute being filterable. */
export const ATTRIBUTE_ERROR_CODES = [
  'attribute-not-found',
  'attribute-name-taken',
  'attribute-slug-taken',
] as const;
export type AttributeErrorCode = (typeof ATTRIBUTE_ERROR_CODES)[number];

/**
 * Where the resolved panel comes from: this category's own overlay, the
 * nearest ancestor's, or the registry when nothing is overlaid.
 */
export const CATEGORY_FILTER_SOURCES = ['own', 'inherited', 'default'] as const;
export type CategoryFilterSource = (typeof CATEGORY_FILTER_SOURCES)[number];
