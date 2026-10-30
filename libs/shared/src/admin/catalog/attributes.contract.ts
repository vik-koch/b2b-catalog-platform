/**
 * The registry of filterable attributes (FR-ATTR-01). A definition names a key
 * staff already type into a product's attributes; it constrains nothing and
 * holds no data of its own.
 */

import { oc } from '@orpc/contract';
import * as z from 'zod';
import { commonAuthErrors } from '../../lib/core/api-error';
import {
  ATTRIBUTE_NAME_MAX_LENGTH,
  ATTRIBUTE_VALUE_MAX_LENGTH,
} from '../../core/catalog/attributes';
import {
  ATTRIBUTE_UNIT_MAX_LENGTH,
  type AttributeErrorCode,
  CATEGORY_FILTER_SOURCES,
} from './attributes';
import { slugSchema } from './slug.contract';
import { attributeTypeSchema } from '../../core/catalog/catalog.contract';

/**
 * The name matches product attribute keys exactly, so only trimming normalizes
 * it: "Colour" and "color" are two attributes until somebody renames one.
 */
export const attributeDefinitionInputSchema = z
  .object({
    name: z.string().trim().min(1).max(ATTRIBUTE_NAME_MAX_LENGTH),
    /** Omitted on create, the server derives one from the name. */
    slug: slugSchema.optional(),
    type: attributeTypeSchema,
    /** Shown after every value ("cm"). Kept out of the values, or "30 cm"
     * and "30cm" would be two facet entries. */
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

/** A definition as staff see it. The counts expose a mistyped name: it reads
 * "0 products" here instead of a facet that never appears. */
export const attributeDefinitionSchema = z
  .object({
    id: z.uuid(),
    name: z.string(),
    slug: z.string(),
    type: attributeTypeSchema,
    unit: z.string().nullable(),
    /** Its place in the filter panel. */
    sortOrder: z.number().int(),
    /** Catalog products carrying this key (deleted products excluded). */
    productCount: z.number().int().nonnegative(),
    /** Of `productCount`, the ones not on the storefront. */
    unpublishedProductCount: z.number().int().nonnegative(),
    /** Distinct values in use: the size of its facet list. */
    valueCount: z.number().int().nonnegative(),
    /** Values with no numeric form: what a `number` definition's facet drops
     * (FR-ATTR-03). */
    unparsedCount: z.number().int().nonnegative(),
    updatedAt: z.iso.datetime(),
  })
  .strict();
export type AttributeDefinition = z.infer<typeof attributeDefinitionSchema>;

/** One definition's new place in the filter panel. */
export const attributeOrderEntrySchema = z
  .object({ id: z.uuid(), sortOrder: z.number().int() })
  .strict();

export const reorderAttributesSchema = z
  .object({ order: z.array(attributeOrderEntrySchema) })
  .strict();
export type ReorderAttributesRequest = z.infer<typeof reorderAttributesSchema>;

/** A missing definition is a 404; a name or slug already taken is a conflict. */
const attributeErrors = {
  'attribute-not-found': { status: 404 },
  'attribute-name-taken': { status: 409 },
  'attribute-slug-taken': { status: 409 },
} as const satisfies Record<AttributeErrorCode, { status: number }>;

/** One attribute key in use, defined or not (FR-ATTR-09): an undeclared key
 * is what the inventory is for. */
export const attributeKeyUsageSchema = z
  .object({
    key: z.string(),
    /** Deleted products are not counted (FR-ADM-22), and a key only they
     * carry is not listed. */
    productCount: z.number().int().positive(),
    /** Of `productCount`, the ones not on the storefront. */
    unpublishedProductCount: z.number().int().nonnegative(),
    valueCount: z.number().int().nonnegative(),
    /** Deleted products carrying it, which a rename rewrites too. */
    deletedProductCount: z.number().int().nonnegative(),
    /** The definition matching the key exactly. Its type says whether a
     * non-numeric value is a finding. */
    definition: z
      .object({ id: z.uuid(), type: attributeTypeSchema })
      .strict()
      .nullable(),
  })
  .strict();
export type AttributeKeyUsage = z.infer<typeof attributeKeyUsageSchema>;

/** One value in use under a key, with the products carrying it. */
export const attributeValueUsageSchema = z
  .object({
    value: z.string(),
    productCount: z.number().int().positive(),
    /** Of `productCount`, the ones not on the storefront. */
    unpublishedProductCount: z.number().int().nonnegative(),
    /** Deleted products carrying it, which a rename rewrites too. */
    deletedProductCount: z.number().int().nonnegative(),
    /** Whether it has a numeric form: a number facet drops the rest. */
    numeric: z.boolean(),
  })
  .strict();
export type AttributeValueUsage = z.infer<typeof attributeValueUsageSchema>;

/**
 * A rename across every product carrying the text: how a typo the inventory
 * shows is corrected. Renaming onto text already in use merges the two.
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
 * `from` may be empty, so older rows stored without a value can be given one.
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
 * One attribute in a category's filter editor (FR-ATTR-11). Every definition
 * appears, offered or not, since the panel's order is set here.
 */
export const categoryFilterSchema = z
  .object({
    attributeId: z.uuid(),
    name: z.string(),
    slug: z.string(),
    type: attributeTypeSchema,
    unit: z.string().nullable(),
    /** Whether this category offers the attribute as a filter. */
    visible: z.boolean(),
    /** Products in this category and its subcategories carrying the key. */
    productCount: z.number().int().nonnegative(),
    /** Of `productCount`, the ones not on the storefront. */
    unpublishedProductCount: z.number().int().nonnegative(),
    /** Declared after the overlay this category resolves to was saved: not
     * offered, and flagged so it does not look excluded on purpose. */
    isNew: z.boolean(),
  })
  .strict();
export type CategoryFilter = z.infer<typeof categoryFilterSchema>;

export const categoryFiltersSchema = z
  .object({
    category: z
      .object({ id: z.uuid(), slug: z.string(), name: z.string() })
      .strict(),
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

/** A whole panel in one write, in panel order. An attribute left out is
 * hidden, so the editor sends every definition it was shown. */
export const saveCategoryFiltersSchema = z
  .object({
    filters: z.array(
      z.object({ attributeId: z.uuid(), visible: z.boolean() }).strict(),
    ),
  })
  .strict();
export type SaveCategoryFiltersRequest = z.infer<
  typeof saveCategoryFiltersSchema
>;

/** The whole-catalogue listing's panel (FR-ATTR-12). Nothing to inherit, so
 * `isNew` is never set. */
export const catalogFiltersSchema = z
  .object({ filters: z.array(categoryFilterSchema) })
  .strict();
export type CatalogFilters = z.infer<typeof catalogFiltersSchema>;

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
      summary:
        "Rename one of an attribute's values across all products (admin)",
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
        params: z.object({ id: z.uuid() }),
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

  getCatalogFilters: admin
    .route({
      method: 'GET',
      path: '/admin/catalog/filters',
      summary: "Read the whole-catalogue listing's filter panel (admin)",
    })
    .output(catalogFiltersSchema),

  saveCatalogFilters: admin
    .route({
      method: 'PUT',
      path: '/admin/catalog/filters',
      inputStructure: 'detailed',
      summary: "Set the whole-catalogue listing's filter panel (admin)",
    })
    .errors({
      'attribute-not-found': attributeErrors['attribute-not-found'],
    })
    .input(z.object({ body: saveCategoryFiltersSchema }))
    .output(catalogFiltersSchema),

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
    .input(z.object({ params: z.object({ id: z.uuid() }) }))
    .output(z.object({ message: z.string() })),
};
