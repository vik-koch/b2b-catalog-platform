import { oc } from '@orpc/contract';
import { z } from 'zod';
import { commonAuthErrors } from './api-error';
import {
  ATTRIBUTE_NAME_MAX_LENGTH,
  ATTRIBUTE_VALUE_MAX_LENGTH,
  attributeTypeSchema,
} from './attribute-value';
import { slugSchema } from './slug';


/**
 * The registry of filterable attributes (FR-ATTR-01), admin side.
 *
 * A definition names an attribute key staff already type into the product
 * attribute grid; it does not constrain what a product may carry and holds no
 * data of its own. Nothing here changes how attributes are entered — the
 * product contracts keep their `attributes: [{key, value}]` array untouched.
 */

/** Matches the `attribute_definitions.unit` varchar. */
export const ATTRIBUTE_UNIT_MAX_LENGTH = 32;

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

/** A missing definition is a 404; a name or slug already taken is a conflict. */
const attributeErrors = {
  'attribute-not-found': { status: 404 },
  'attribute-name-taken': { status: 409 },
  'attribute-slug-taken': { status: 409 },
} as const satisfies Record<AttributeErrorCode, { status: number }>;

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

/**
 * Scoped to one key: renaming "Blue" must not touch an unrelated attribute.
 *
 * `from` may be empty, and only `from`: a product saved before valueless
 * attributes stopped being stored carries rows with no value at all, and giving
 * them one in a single statement is the same correction as any other rename.
 */
export const renameAttributeValueSchema = z
  .object({
    key: z.string().trim().min(1).max(ATTRIBUTE_NAME_MAX_LENGTH),
    from: z.string().trim().max(ATTRIBUTE_VALUE_MAX_LENGTH),
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

/**
 * One attribute as a category's filter editor shows it (FR-ATTR-11).
 *
 * Every definition in the registry appears, offered or not: the panel's order
 * is set here, and an attribute nobody has typed under this category yet still
 * has a place in it. `productCount` is how many of the category's own products
 * carry the key, and it is what makes an irrelevant attribute obvious — a zero
 * would never render a facet anyway.
 */
export const categoryFilterSchema = z
  .object({
    attributeId: z.string().uuid(),
    name: z.string(),
    slug: z.string(),
    type: attributeTypeSchema,
    unit: z.string().nullable(),
    /** Whether this category offers the attribute as a filter. */
    visible: z.boolean(),
    /** Products in this category and its subcategories carrying the key. */
    productCount: z.number().int().nonnegative(),
    /**
     * Declared after the overlay this category resolves to was saved, so it is
     * in no row of it. Not offered here, and flagged rather than left looking
     * like a deliberate exclusion.
     */
    isNew: z.boolean(),
  })
  .strict();
export type CategoryFilter = z.infer<typeof categoryFilterSchema>;

/**
 * Where the resolved panel comes from: this category's own overlay, the
 * nearest ancestor's, or the registry when nothing is overlaid.
 */
export const CATEGORY_FILTER_SOURCES = ['own', 'inherited', 'default'] as const;
export type CategoryFilterSource = (typeof CATEGORY_FILTER_SOURCES)[number];

export const categoryFiltersSchema = z
  .object({
    category: z.object({ slug: z.string(), name: z.string() }).strict(),
    source: z.enum(CATEGORY_FILTER_SOURCES),
    /** The category the overlay was read from, when it is not this one. */
    inheritedFrom: z
      .object({ slug: z.string(), name: z.string() })
      .strict()
      .nullable(),
    filters: z.array(categoryFilterSchema),
  })
  .strict();
export type CategoryFilters = z.infer<typeof categoryFiltersSchema>;

/**
 * A whole panel in one write — the array order *is* the panel order, and an
 * attribute left out of it is treated as hidden, so the editor always sends
 * every definition it was shown.
 */
export const saveCategoryFiltersSchema = z
  .object({
    filters: z.array(
      z
        .object({ attributeId: z.string().uuid(), visible: z.boolean() })
        .strict(),
    ),
  })
  .strict();
export type SaveCategoryFiltersRequest = z.infer<
  typeof saveCategoryFiltersSchema
>;

/** A filter panel names a category and the attributes on it; either can be gone. */
const categoryFilterErrors = {
  'category-not-found': { status: 404 },
  'attribute-not-found': attributeErrors['attribute-not-found'],
} as const;

/** Every route here is admin-only. */
const admin = oc.errors(commonAuthErrors);

export const attributesContract = {
  listAttributes: admin
    .route({
      method: 'GET',
      path: '/admin/attributes',
      summary: 'List the filterable attribute definitions (admin)',
    })
    .output(
      z.object({ definitions: z.array(attributeDefinitionSchema) }).strict(),
    ),

  listAttributeKeys: admin
    .route({
      method: 'GET',
      path: '/admin/attributes/inventory',
      summary: 'List every attribute key in use, defined or freetext (admin)',
    })
    .output(z.object({ keys: z.array(attributeKeyUsageSchema) }).strict()),

  listAttributeValues: admin
    .route({
      method: 'GET',
      path: '/admin/attributes/inventory/values',
      inputStructure: 'detailed',
      summary: 'List the values in use under one attribute key (admin)',
    })
    .input(
      z.object({
        query: z.object({
          key: z.string().min(1).max(ATTRIBUTE_NAME_MAX_LENGTH),
        }),
      }),
    )
    .output(
      z
        .object({
          key: z.string(),
          values: z.array(attributeValueUsageSchema),
        })
        .strict(),
    ),

  renameAttributeKey: admin
    .route({
      method: 'POST',
      path: '/admin/attributes/inventory/rename-key',
      inputStructure: 'detailed',
      summary: 'Rename an attribute key across all products (admin)',
    })
    .input(z.object({ body: renameAttributeKeySchema }))
    .output(renameResultSchema),

  renameAttributeValue: admin
    .route({
      method: 'POST',
      path: '/admin/attributes/inventory/rename-value',
      inputStructure: 'detailed',
      summary: "Rename one of an attribute's values across all products (admin)",
    })
    .input(z.object({ body: renameAttributeValueSchema }))
    .output(renameResultSchema),

  createAttribute: admin
    .route({
      method: 'POST',
      path: '/admin/attributes',
      successStatus: 201,
      inputStructure: 'detailed',
      summary: 'Declare an attribute filterable (admin)',
    })
    // Name or slug already taken.
    .errors({
      'attribute-name-taken': attributeErrors['attribute-name-taken'],
      'attribute-slug-taken': attributeErrors['attribute-slug-taken'],
    })
    .input(z.object({ body: attributeDefinitionInputSchema }))
    .output(attributeDefinitionSchema),

  updateAttribute: admin
    .route({
      method: 'PUT',
      path: '/admin/attributes/{id}',
      inputStructure: 'detailed',
      summary: 'Rename or retype an attribute definition (admin)',
    })
    .errors(attributeErrors)
    .input(
      z.object({
        params: z.object({ id: z.string().uuid() }),
        body: attributeDefinitionInputSchema,
      }),
    )
    .output(attributeDefinitionSchema),

  reorderAttributes: admin
    .route({
      method: 'PATCH',
      // No clash with `/admin/attributes/{id}`: nothing else answers PATCH here.
      path: '/admin/attributes/order',
      inputStructure: 'detailed',
      summary: 'Set the order of the filter panel (admin)',
    })
    .errors({
      'attribute-not-found': attributeErrors['attribute-not-found'],
    })
    .input(z.object({ body: reorderAttributesSchema }))
    .output(
      z.object({ definitions: z.array(attributeDefinitionSchema) }).strict(),
    ),

  getCategoryFilters: admin
    .route({
      method: 'GET',
      path: '/admin/categories/{slug}/filters',
      inputStructure: 'detailed',
      summary: "Read one category's filter panel (admin)",
    })
    .errors(categoryFilterErrors)
    .input(z.object({ params: z.object({ slug: slugSchema }) }))
    .output(categoryFiltersSchema),

  saveCategoryFilters: admin
    .route({
      method: 'PUT',
      path: '/admin/categories/{slug}/filters',
      inputStructure: 'detailed',
      summary: "Set one category's filter panel (admin)",
    })
    .errors(categoryFilterErrors)
    .input(
      z.object({
        params: z.object({ slug: slugSchema }),
        body: saveCategoryFiltersSchema,
      }),
    )
    .output(categoryFiltersSchema),

  resetCategoryFilters: admin
    .route({
      method: 'DELETE',
      path: '/admin/categories/{slug}/filters',
      inputStructure: 'detailed',
      summary: 'Drop a category overlay and inherit again (admin)',
    })
    .errors(categoryFilterErrors)
    .input(z.object({ params: z.object({ slug: slugSchema }) }))
    .output(categoryFiltersSchema),

  deleteAttribute: admin
    .route({
      method: 'DELETE',
      path: '/admin/attributes/{id}',
      inputStructure: 'detailed',
      summary: 'Stop filtering by an attribute (admin)',
    })
    .errors({
      'attribute-not-found': attributeErrors['attribute-not-found'],
    })
    .input(z.object({ params: z.object({ id: z.string().uuid() }) }))
    .output(z.object({ message: z.string() })),
};
