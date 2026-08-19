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
