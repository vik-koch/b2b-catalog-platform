import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import {
  catalogImageSchema,
  priceMinorSchema,
  productAttributeSchema,
} from './catalog.contract';
import { slugSchema } from './slug';

/** Admin grid page size — denser than the storefront's, for scanning. */
export const ADMIN_CATALOG_PAGE_SIZE = 50;

const c = initContract();

/**
 * The admin write surface for the catalog — the counterpart to the public read
 * contract in `catalog.contract.ts`, kept deliberately separate so the
 * storefront's stable read shapes never entangle with editing.
 *
 * Every route here is admin-only and speaks the *editable* shape, which
 * — unlike the public read model — exposes fields the storefront never sees:
 * a product's `categoryId` (the picker's handle), its private `sourceId` sync
 * key, and its `deletedAt` (so the admin grid can render soft-deleted rows).
 */

/** Matches the `products.name` varchar(512). */
export const PRODUCT_NAME_MAX_LENGTH = 512;

/**
 * A DoS guard on the description, not an editorial rule — comfortably more than
 * any product needs while staying well under Express's default body limit, so an
 * oversized body fails contract validation with an explainable 400 rather than
 * an opaque 413. Smaller than a static page's cap (product copy is short).
 */
export const PRODUCT_DESCRIPTION_MAX_LENGTH = 32_000;

/** Caps on the custom-attribute table (FR-CAT-05). Bounds, not business rules. */
export const PRODUCT_ATTRIBUTES_MAX = 100;
export const PRODUCT_ATTRIBUTE_KEY_MAX_LENGTH = 200;
export const PRODUCT_ATTRIBUTE_VALUE_MAX_LENGTH = 2000;

/** A gallery is a short ordered list, not an archive. */
export const PRODUCT_IMAGES_MAX = 20;

/** Matches the `products.sourceId` / `categories.sourceKey` varchar(255). */
export const SOURCE_ID_MAX_LENGTH = 255;

/** Matches the `categories.name` varchar(255). */
export const CATEGORY_NAME_MAX_LENGTH = 255;

/**
 * A single attribute row, reusing the public read shape but with length bounds —
 * the read contract trusts stored data, the write contract validates input.
 */
const attributeInputSchema = productAttributeSchema.extend({
  key: z.string().trim().max(PRODUCT_ATTRIBUTE_KEY_MAX_LENGTH),
  value: z.string().trim().max(PRODUCT_ATTRIBUTE_VALUE_MAX_LENGTH),
});

/**
 * What create and update accept.
 *
 * `slug` is optional and defaults to stability: omitted on create → the server
 * derives one from the name by transliteration (`slugify`); omitted on update →
 * the existing slug is kept, so a rename never silently changes the URL
 * (a changed URL breaks links/SEO). Providing it is a deliberate override
 * (a hand-picked or corrected slug); a collision with another product is a 409.
 *
 * `sourceId` is optional; the server mints a `manual:<uuid>` when omitted and
 * rejects a collision with 409.
 */
export const productInputSchema = z
  .object({
    name: z.string().trim().min(1).max(PRODUCT_NAME_MAX_LENGTH),
    /** Optional slug override; see the schema doc. */
    slug: slugSchema.optional(),
    priceMinor: priceMinorSchema,
    /** The single owning category (FR-CAT-05); picked from the admin tree. */
    categoryId: z.string().uuid(),
    /** Sanitized server-side before storage, same discipline as page bodies.
     * May be empty. The editor is limited to PRODUCT_RICH_TEXT_TAGS. */
    descriptionHtml: z.string().max(PRODUCT_DESCRIPTION_MAX_LENGTH).default(''),
    attributes: z
      .array(attributeInputSchema)
      .max(PRODUCT_ATTRIBUTES_MAX)
      .default([]),
    /** Ordered gallery; array order is display order. Each is a stored
     * `{ full, thumb }` media pair (ADR 0021/0022). */
    images: z.array(catalogImageSchema).max(PRODUCT_IMAGES_MAX).default([]),
    /** Private sync key. Admin-settable to pre-assign a legacy key for future
     * file reconciliation; omit to let the server generate `manual:<uuid>`. */
    sourceId: z.string().trim().min(1).max(SOURCE_ID_MAX_LENGTH).optional(),
  })
  .strict();
export type ProductInput = z.infer<typeof productInputSchema>;

/**
 * The full editable product the admin editor loads and re-renders after a save —
 * the overlay and file-owned fields plus the admin-only handles.
 */
export const adminProductSchema = z
  .object({
    slug: z.string(),
    name: z.string(),
    priceMinor: priceMinorSchema,
    categoryId: z.string().uuid(),
    sourceId: z.string(),
    descriptionHtml: z.string(),
    attributes: z.array(productAttributeSchema),
    images: z.array(catalogImageSchema),
    /** ISO 8601, or null when live. Drives the greyed-out admin styling. */
    deletedAt: z.string().datetime().nullable(),
    updatedAt: z.string().datetime(),
  })
  .strict();
export type AdminProduct = z.infer<typeof adminProductSchema>;

/** A lighter row for the admin grid (includes deleted; one thumb for preview). */
export const adminProductListItemSchema = z
  .object({
    slug: z.string(),
    name: z.string(),
    priceMinor: priceMinorSchema,
    categoryId: z.string().uuid(),
    thumb: z.string().nullable(),
    deletedAt: z.string().datetime().nullable(),
  })
  .strict();
export type AdminProductListItem = z.infer<typeof adminProductListItemSchema>;

/** Admin grid query: 1-based page, optional category filter. Deleted rows are
 * always included — the admin sees the whole catalog. */
export const adminProductListQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  categoryId: z.string().uuid().optional(),
});

/**
 * A category as the management screen sees it: the structural fields plus the
 * presentation overlay, and the two counts the delete guard needs — a category
 * with products or children cannot be removed (FK is `restrict`).
 * Returned as a flat list; the client shapes the tree (same as the read side).
 */
export const adminCategorySchema = z
  .object({
    id: z.string().uuid(),
    slug: z.string(),
    name: z.string(),
    parentId: z.string().uuid().nullable(),
    sortOrder: z.number().int(),
    image: catalogImageSchema.nullable(),
    description: z.string().nullable(),
    productCount: z.number().int().nonnegative(),
    childCount: z.number().int().nonnegative(),
  })
  .strict();
export type AdminCategory = z.infer<typeof adminCategorySchema>;

/** What create/update accept for a category. `slug` follows the same
 * optional-override rule as products (omit to derive/keep). `sourceKey` is
 * server-owned. Reorder/reparent within the tree goes through `reorder`, but a
 * single move may also set `parentId` here. */
export const categoryInputSchema = z
  .object({
    name: z.string().trim().min(1).max(CATEGORY_NAME_MAX_LENGTH),
    /** Optional slug override; see the product schema doc. */
    slug: slugSchema.optional(),
    parentId: z.string().uuid().nullable().default(null),
    image: catalogImageSchema.nullable().default(null),
    description: z
      .string()
      .max(PRODUCT_DESCRIPTION_MAX_LENGTH)
      .nullable()
      .default(null),
  })
  .strict();
export type CategoryInput = z.infer<typeof categoryInputSchema>;

/**
 * One node's new place after a drag-drop rearrange. The client posts the whole
 * set it changed (or all of them — it is idempotent): each row's `parentId` and
 * `sortOrder` are set as given, in a single transaction, so the tree can never
 * be left half-reordered.
 */
export const categoryOrderEntrySchema = z
  .object({
    id: z.string().uuid(),
    parentId: z.string().uuid().nullable(),
    sortOrder: z.number().int().nonnegative(),
  })
  .strict();

export const reorderCategoriesSchema = z
  .object({ order: z.array(categoryOrderEntrySchema) })
  .strict();
export type ReorderCategoriesRequest = z.infer<typeof reorderCategoriesSchema>;

const messageSchema = z.object({ message: z.string() });

export const adminCatalogContract = c.router(
  {
    // --- Products ---------------------------------------------------------
    listProducts: {
      method: 'GET',
      path: '/admin/catalog/products',
      query: adminProductListQuerySchema,
      responses: {
        200: z
          .object({
            items: z.array(adminProductListItemSchema),
            pagination: z
              .object({
                page: z.number().int().positive(),
                pageSize: z.number().int().positive(),
                total: z.number().int().nonnegative(),
                totalPages: z.number().int().nonnegative(),
              })
              .strict(),
          })
          .strict(),
      },
      summary: 'List products for the admin grid (includes soft-deleted)',
    },
    getProduct: {
      method: 'GET',
      path: '/admin/catalog/products/:slug',
      responses: { 200: adminProductSchema, 404: messageSchema },
      summary: 'Get a product in editable form (admin)',
    },
    createProduct: {
      method: 'POST',
      path: '/admin/catalog/products',
      body: productInputSchema,
      responses: {
        201: adminProductSchema,
        // Category not found.
        404: messageSchema,
        // Duplicate sourceId.
        409: messageSchema,
      },
      summary: 'Create a product (admin; body sanitized, slug generated)',
    },
    updateProduct: {
      method: 'PUT',
      path: '/admin/catalog/products/:slug',
      body: productInputSchema,
      responses: {
        200: adminProductSchema,
        404: messageSchema,
        409: messageSchema,
      },
      summary: 'Replace a product (admin; slug stays fixed)',
    },
    deleteProduct: {
      method: 'DELETE',
      path: '/admin/catalog/products/:slug',
      // No body; soft delete only (sets deletedAt).
      body: z.void(),
      responses: { 200: adminProductSchema, 404: messageSchema },
      summary: 'Soft-delete a product (admin; reversible via restore)',
    },
    restoreProduct: {
      method: 'POST',
      path: '/admin/catalog/products/:slug/restore',
      // No payload; an empty object is the repo's no-body POST convention
      // (cf. auth logout) — a POST body is parsed to `{}`, which `z.void()`
      // would reject.
      body: z.object({}),
      responses: { 200: adminProductSchema, 404: messageSchema },
      summary: 'Restore a soft-deleted product (admin)',
    },

    // --- Categories -------------------------------------------------------
    listCategories: {
      method: 'GET',
      path: '/admin/catalog/categories',
      responses: {
        200: z.object({ categories: z.array(adminCategorySchema) }).strict(),
      },
      summary: 'List all categories with counts (admin management view)',
    },
    createCategory: {
      method: 'POST',
      path: '/admin/catalog/categories',
      body: categoryInputSchema,
      responses: { 201: adminCategorySchema, 404: messageSchema },
      summary: 'Create a category (admin; slug/sourceKey generated)',
    },
    updateCategory: {
      method: 'PUT',
      path: '/admin/catalog/categories/:id',
      pathParams: z.object({ id: z.string().uuid() }),
      body: categoryInputSchema,
      responses: { 200: adminCategorySchema, 404: messageSchema },
      summary: 'Update a category name/overlay (admin)',
    },
    deleteCategory: {
      method: 'DELETE',
      path: '/admin/catalog/categories/:id',
      pathParams: z.object({ id: z.string().uuid() }),
      // `reassignTo` moves every product (including soft-deleted ones — the FK
      // is `restrict` and blocks on those too) to another category first, so a
      // populated category can be deleted without orphaning its products. Omit
      // it to keep the strict guard (409 if the category has any products).
      // Subcategories always block regardless — the admin resolves the subtree
      // first; reassignment never merges child categories.
      query: z.object({ reassignTo: z.string().uuid().optional() }),
      body: z.void(),
      responses: {
        200: messageSchema,
        // Category (or the reassign target) not found.
        404: messageSchema,
        // Blocked: has subcategories, or has products and no `reassignTo`.
        409: messageSchema,
      },
      summary:
        'Delete a category (admin; optionally reassign its products first)',
    },
    reorderCategories: {
      method: 'PATCH',
      path: '/admin/catalog/categories/order',
      body: reorderCategoriesSchema,
      responses: {
        200: z.object({ categories: z.array(adminCategorySchema) }).strict(),
        404: messageSchema,
      },
      summary: 'Reparent/reorder categories in one transaction (admin)',
    },
  },
  {
    // Every admin catalog route can be rejected by the auth guards; declare the
    // shared statuses once rather than on each route.
    commonResponses: { 401: messageSchema, 403: messageSchema },
  },
);
