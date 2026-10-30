import { oc } from '@orpc/contract';
import * as z from 'zod';
import { CATEGORY_NAME_MAX_LENGTH } from '../../core/catalog/categories';
import { SOURCE_ID_MAX_LENGTH } from '../../core/catalog/products';
import { commonAuthErrors } from '../../lib/core/api-error';
import { ownershipErrors } from '../../sync/ownership-constants';
import { catalogImageSchema } from '../../core/catalog/catalog.contract';
import { slugSchema } from './slug.contract';
import { CATALOG_ERRORS } from './catalog-errors';

/**
 * A category as the management screen sees it: the structural fields plus the
 * presentation overlay, and its counts. Returned as a flat list; the client
 * shapes the tree (same as the read side).
 */
export const adminCategorySchema = z
  .object({
    id: z.uuid(),
    slug: z.string(),
    name: z.string(),
    parentId: z.uuid().nullable(),
    sortOrder: z.number().int(),
    /** Null for a category the shop made up: no source system knows it, which
     * is also what leaves its name the shop's to change. */
    sourceId: z.string().nullable(),
    /** Optional nickname for contexts where the parent is visible; see the
     * public contract's `shortNameSchema`. */
    shortName: z.string().nullable(),
    /** The chip mark (FR-CAT-07). */
    mark: catalogImageSchema.nullable(),
    /** Everything beneath it, subcategories included (FR-ADM-19), live and
     * unpublished: the population the admin grid filtered by the category
     * lists. Deleted products are out of the catalog (FR-ADM-22). */
    productCount: z.number().int().nonnegative(),
    /** Of `productCount`, the ones on the storefront. None means the
     * storefront leaves the category out of its navigation. */
    liveProductCount: z.number().int().nonnegative(),
    /** Only the products filed in it, live and unpublished. */
    directProductCount: z.number().int().nonnegative(),
    /** The deleted products filed in it. Counted nowhere else, but they hold
     * the foreign key, so with `directProductCount` and `childCount` this is
     * what the delete guard reads (FK is `restrict`). */
    deletedProductCount: z.number().int().nonnegative(),
    childCount: z.number().int().nonnegative(),
  })
  .strict();
export type AdminCategory = z.infer<typeof adminCategorySchema>;

/** What create/update accept for a category. `slug` follows the same
 * optional-override rule as products (omit to derive/keep). Reorder and
 * reparent within the tree go through `reorder`, but a single move may also set
 * `parentId` here. */
export const categoryInputSchema = z
  .object({
    name: z.string().trim().min(1).max(CATEGORY_NAME_MAX_LENGTH),
    /** Optional nickname, admin-owned overlay. Empty means "no nickname" and is
     * normalized to null, so the fallback to `name` has one representation. */
    shortName: z
      .string()
      .trim()
      .max(CATEGORY_NAME_MAX_LENGTH)
      .nullable()
      .default(null)
      .transform((value) => value || null),
    /** Optional slug override; see the product schema doc. */
    slug: slugSchema.optional(),
    parentId: z.uuid().nullable().default(null),
    /** The mark shown where the category is a chip. */
    mark: catalogImageSchema.nullable().default(null),
    /**
     * Private sync key. Admin-settable to pre-assign a legacy key for future
     * file reconciliation. Three values, three meanings: omitted keeps what is
     * stored, `null` detaches the category from the exchange, and a string
     * binds it to that key. A category created without one has none — unlike a
     * product, it is a container the shop invented, not a row the source
     * system is missing.
     */
    sourceId: z
      .string()
      .trim()
      .min(1)
      .max(SOURCE_ID_MAX_LENGTH)
      .nullable()
      .optional(),
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
    id: z.uuid(),
    parentId: z.uuid().nullable(),
    sortOrder: z.number().int().nonnegative(),
  })
  .strict();
export type CategoryOrderEntry = z.infer<typeof categoryOrderEntrySchema>;

export const reorderCategoriesSchema = z
  .object({ order: z.array(categoryOrderEntrySchema) })
  .strict();
export type ReorderCategoriesRequest = z.infer<typeof reorderCategoriesSchema>;

/** A category is addressed by the same two unique columns a product is, so
 * writing one collides the same way — including on create, where an admin
 * pre-assigns the source system's key to a category entered by hand. */
const categoryIdentityErrors = {
  'slug-taken': CATALOG_ERRORS['slug-taken'],
  'source-id-taken': CATALOG_ERRORS['source-id-taken'],
  'slug-or-source-id-taken': CATALOG_ERRORS['slug-or-source-id-taken'],
} as const;

/**
 * Every category route can be rejected by the auth guards; declared once
 * here rather than on each route.
 */
const admin = oc.errors(commonAuthErrors);

export const adminCategoriesContract = {
  listCategories: admin
    .route({
      method: 'GET',
      path: '/admin/catalog/categories',
      summary: 'List all categories with counts (admin management view)',
    })
    .output(z.object({ categories: z.array(adminCategorySchema) }).strict()),

  createCategory: admin
    .route({
      method: 'POST',
      path: '/admin/catalog/categories',
      successStatus: 201,
      inputStructure: 'detailed',
      summary: 'Create a category (admin; slug derived when omitted)',
    })
    .errors({
      'category-not-found': CATALOG_ERRORS['category-not-found'],
      ...categoryIdentityErrors,
    })
    .input(z.object({ body: categoryInputSchema }))
    .output(adminCategorySchema),

  updateCategory: admin
    .route({
      method: 'PUT',
      path: '/admin/catalog/categories/{id}',
      inputStructure: 'detailed',
      summary: 'Update a category name/overlay (admin)',
    })
    .errors({
      'category-not-found': CATALOG_ERRORS['category-not-found'],
      'category-cycle': CATALOG_ERRORS['category-cycle'],
      // Its name and source id are the exchange's while the catalog is owned;
      // the rest of the row — nickname, parent, mark — is the
      // shop's presentation and stays editable throughout.
      'catalog-externally-owned': ownershipErrors['catalog-externally-owned'],
      ...categoryIdentityErrors,
    })
    .input(
      z.object({
        params: z.object({ id: z.uuid() }),
        body: categoryInputSchema,
      }),
    )
    .output(adminCategorySchema),

  deleteCategory: admin
    .route({
      method: 'DELETE',
      path: '/admin/catalog/categories/{id}',
      inputStructure: 'detailed',
      summary:
        'Delete a category (admin; optionally reassign its products first)',
    })
    .errors({
      // Category (or the reassign target) not found.
      'category-not-found': CATALOG_ERRORS['category-not-found'],
      'reassign-target-not-found': CATALOG_ERRORS['reassign-target-not-found'],
      // Blocked: has subcategories, or has products and no `reassignTo`.
      'category-has-subcategories':
        CATALOG_ERRORS['category-has-subcategories'],
      'category-has-products': CATALOG_ERRORS['category-has-products'],
      'category-reassign-to-self': CATALOG_ERRORS['category-reassign-to-self'],
      // `reassignTo` while the catalog is owned: moving products between
      // categories is a write to the field the exchange holds, whatever the
      // route it arrives on. Deleting an *empty* category is unaffected.
      'catalog-externally-owned': ownershipErrors['catalog-externally-owned'],
    })
    .input(
      z.object({
        params: z.object({ id: z.uuid() }),
        // `reassignTo` moves every product (including soft-deleted ones — the
        // FK is `restrict` and blocks on those too) to another category first,
        // so a populated category can be deleted without orphaning its
        // products. Omit it to keep the strict guard (409 if the category has
        // any products). Subcategories always block regardless — the admin
        // resolves the subtree first; reassignment never merges child
        // categories.
        query: z.object({ reassignTo: z.uuid().optional() }),
      }),
    )
    .output(z.object({ message: z.string() })),

  reorderCategories: admin
    .route({
      method: 'PATCH',
      // No clash with `/admin/catalog/categories/{id}`: nothing else answers
      // PATCH here.
      path: '/admin/catalog/categories/order',
      inputStructure: 'detailed',
      summary: 'Reparent/reorder categories in one transaction (admin)',
    })
    .errors({
      'category-not-found': CATALOG_ERRORS['category-not-found'],
      'category-cycle': CATALOG_ERRORS['category-cycle'],
    })
    .input(z.object({ body: reorderCategoriesSchema }))
    .output(z.object({ categories: z.array(adminCategorySchema) }).strict()),
};
