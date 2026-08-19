import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import { apiErrorSchema, commonAuthErrorSchema } from './api-error';
import { slugSchema } from './slug';

const c = initContract();

/**
 * The registry of filterable attributes (FR-ATTR-01), admin side.
 *
 * A definition names an attribute key staff already type into the product
 * attribute grid; it does not constrain what a product may carry and holds no
 * data of its own. Nothing here changes how attributes are entered — the
 * product contracts keep their `attributes: [{key, value}]` array untouched.
 */

/** Matches the `attribute_definitions.name` varchar, and `product_attributes.key`. */
export const ATTRIBUTE_NAME_MAX_LENGTH = 200;
/** Matches the `attribute_definitions.unit` varchar. */
export const ATTRIBUTE_UNIT_MAX_LENGTH = 32;

/**
 * How the attribute's values are read. `number` only decides ordering and
 * whether a value can appear in the facet at all — it is never a validator:
 * an unparseable value is still stored and displayed (FR-ATTR-03).
 */
export const ATTRIBUTE_TYPES = ['text', 'number'] as const;
export const attributeTypeSchema = z.enum(ATTRIBUTE_TYPES);
export type AttributeType = (typeof ATTRIBUTE_TYPES)[number];

/**
 * The name is matched against a product's attribute keys exactly, so it is
 * trimmed on both sides and nothing else is normalized: "Colour" and "color"
 * are two attributes, visibly, until somebody renames one.
 */
export const attributeDefinitionInputSchema = z
  .object({
    name: z.string().trim().min(1).max(ATTRIBUTE_NAME_MAX_LENGTH),
    /** Omitted on create, the server derives one from the name. */
    slug: slugSchema.optional(),
    type: attributeTypeSchema,
    /**
     * Display suffix ("cm"), shown after every value of this attribute. It
     * belongs here rather than inside a value, or "30 cm" and "30cm" become
     * two facet entries.
     */
    unit: z
      .string()
      .trim()
      .max(ATTRIBUTE_UNIT_MAX_LENGTH)
      .nullable()
      .default(null),
  })
  .strict();
export type AttributeDefinitionInput = z.infer<
  typeof attributeDefinitionInputSchema
>;

/**
 * A definition as staff see it. The three counts are what makes a mistyped
 * name answerable on the spot: a definition whose name matches nothing reads
 * "0 products" here rather than turning up as a facet that never appears.
 */
export const attributeDefinitionSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string(),
    slug: z.string(),
    type: attributeTypeSchema,
    unit: z.string().nullable(),
    /** Where the attribute sits in the filter panel. Presentation only. */
    sortOrder: z.number().int(),
    /** Catalog products carrying this key (deleted products excluded). */
    productCount: z.number().int().nonnegative(),
    /** Distinct values in use under it — the size of its facet list. */
    valueCount: z.number().int().nonnegative(),
    /**
     * Values with no numeric form. Only meaningful for a `number` definition,
     * where it is the count that drops out of the facet (FR-ATTR-03); text
     * definitions carry it too rather than a null nobody would render.
     */
    unparsedCount: z.number().int().nonnegative(),
    updatedAt: z.string().datetime(),
  })
  .strict();
export type AttributeDefinition = z.infer<typeof attributeDefinitionSchema>;

/** One definition's new place in the filter panel. */
export const attributeOrderEntrySchema = z
  .object({ id: z.string().uuid(), sortOrder: z.number().int() })
  .strict();

export const reorderAttributesSchema = z
  .object({ order: z.array(attributeOrderEntrySchema) })
  .strict();
export type ReorderAttributesRequest = z.infer<typeof reorderAttributesSchema>;

/**
 * Why a definition was refused. Both conflicts are uniqueness: one name can
 * only describe one attribute, and one slug can only address one filter.
 * There is no delete guard — a definition holds no data, so deleting it only
 * stops the attribute being filterable.
 */
export const ATTRIBUTE_ERROR_CODES = [
  'attribute-not-found',
  'attribute-name-taken',
  'attribute-slug-taken',
] as const;
export type AttributeErrorCode = (typeof ATTRIBUTE_ERROR_CODES)[number];
const attributeErrorSchema = apiErrorSchema(ATTRIBUTE_ERROR_CODES);

/**
 * One attribute key in use across the catalog, defined or freetext
 * (FR-ATTR-09). This is the inventory's row, and it is deliberately not the
 * registry's: a key nobody declared is exactly what an admin comes here to
 * find.
 */
export const attributeKeyUsageSchema = z
  .object({
    key: z.string(),
    productCount: z.number().int().nonnegative(),
    valueCount: z.number().int().nonnegative(),
    /**
     * The definition matching this key exactly, if there is one. Its type
     * comes along because it decides what the values mean here: under a number
     * attribute, a value with no numeric form is a finding.
     */
    definition: z
      .object({ id: z.string().uuid(), type: attributeTypeSchema })
      .strict()
      .nullable(),
  })
  .strict();
export type AttributeKeyUsage = z.infer<typeof attributeKeyUsageSchema>;

/** One value in use under a key, with the products carrying it. */
export const attributeValueUsageSchema = z
  .object({
    value: z.string(),
    productCount: z.number().int().nonnegative(),
    /** Whether the value has a numeric form — a number facet drops the rest. */
    numeric: z.boolean(),
  })
  .strict();
export type AttributeValueUsage = z.infer<typeof attributeValueUsageSchema>;

/**
 * A rename across every product carrying the text. Renaming *is* the
 * correction path: attribute text is matched exactly, so a typo is visible in
 * the inventory rather than silently merged, and this is what fixes it in one
 * statement instead of forty product saves.
 *
 * Renaming onto text already in use merges the two, which is the usual reason
 * for doing it.
 */
export const renameAttributeKeySchema = z
  .object({
    from: z.string().trim().min(1).max(ATTRIBUTE_NAME_MAX_LENGTH),
    to: z.string().trim().min(1).max(ATTRIBUTE_NAME_MAX_LENGTH),
  })
  .strict();
export type RenameAttributeKeyRequest = z.infer<
  typeof renameAttributeKeySchema
>;

/** Longest attribute value we store (matches the `value` varchar). */
export const ATTRIBUTE_VALUE_MAX_LENGTH = 2000;

/** Scoped to one key: renaming "Blue" must not touch an unrelated attribute. */
export const renameAttributeValueSchema = z
  .object({
    key: z.string().trim().min(1).max(ATTRIBUTE_NAME_MAX_LENGTH),
    from: z.string().trim().min(1).max(ATTRIBUTE_VALUE_MAX_LENGTH),
    to: z.string().trim().min(1).max(ATTRIBUTE_VALUE_MAX_LENGTH),
  })
  .strict();
export type RenameAttributeValueRequest = z.infer<
  typeof renameAttributeValueSchema
>;

/** How many product attributes a rename rewrote. */
export const renameResultSchema = z
  .object({ updated: z.number().int().nonnegative() })
  .strict();

export const attributesContract = c.router(
  {
    listAttributes: {
      method: 'GET',
      path: '/admin/attributes',
      responses: {
        200: z
          .object({ definitions: z.array(attributeDefinitionSchema) })
          .strict(),
      },
      summary: 'List the filterable attribute definitions (admin)',
    },
    listAttributeKeys: {
      method: 'GET',
      path: '/admin/attributes/inventory',
      responses: {
        200: z.object({ keys: z.array(attributeKeyUsageSchema) }).strict(),
      },
      summary: 'List every attribute key in use, defined or freetext (admin)',
    },
    listAttributeValues: {
      method: 'GET',
      path: '/admin/attributes/inventory/values',
      query: z.object({
        key: z.string().min(1).max(ATTRIBUTE_NAME_MAX_LENGTH),
      }),
      responses: {
        200: z
          .object({
            key: z.string(),
            values: z.array(attributeValueUsageSchema),
          })
          .strict(),
      },
      summary: 'List the values in use under one attribute key (admin)',
    },
    renameAttributeKey: {
      method: 'POST',
      path: '/admin/attributes/inventory/rename-key',
      body: renameAttributeKeySchema,
      responses: { 200: renameResultSchema },
      summary: 'Rename an attribute key across all products (admin)',
    },
    renameAttributeValue: {
      method: 'POST',
      path: '/admin/attributes/inventory/rename-value',
      body: renameAttributeValueSchema,
      responses: { 200: renameResultSchema },
      summary:
        "Rename one of an attribute's values across all products (admin)",
    },
    createAttribute: {
      method: 'POST',
      path: '/admin/attributes',
      body: attributeDefinitionInputSchema,
      responses: {
        201: attributeDefinitionSchema,
        // Name or slug already taken.
        409: attributeErrorSchema,
      },
      summary: 'Declare an attribute filterable (admin)',
    },
    updateAttribute: {
      method: 'PUT',
      path: '/admin/attributes/:id',
      pathParams: z.object({ id: z.string().uuid() }),
      body: attributeDefinitionInputSchema,
      responses: {
        200: attributeDefinitionSchema,
        404: attributeErrorSchema,
        409: attributeErrorSchema,
      },
      summary: 'Rename or retype an attribute definition (admin)',
    },
    reorderAttributes: {
      method: 'PATCH',
      path: '/admin/attributes/order',
      body: reorderAttributesSchema,
      responses: {
        200: z
          .object({ definitions: z.array(attributeDefinitionSchema) })
          .strict(),
        404: attributeErrorSchema,
      },
      summary: 'Set the order of the filter panel (admin)',
    },
    deleteAttribute: {
      method: 'DELETE',
      path: '/admin/attributes/:id',
      pathParams: z.object({ id: z.string().uuid() }),
      body: z.void(),
      responses: {
        200: z.object({ message: z.string() }),
        404: attributeErrorSchema,
      },
      summary: 'Stop filtering by an attribute (admin)',
    },
  },
  {
    commonResponses: { 401: commonAuthErrorSchema, 403: commonAuthErrorSchema },
  },
);
