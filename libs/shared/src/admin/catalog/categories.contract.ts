import { oc } from '@orpc/contract';
import * as z from 'zod';
import { CATEGORY_NAME_MAX_LENGTH } from '../../core/catalog/categories';
import { SOURCE_ID_MAX_LENGTH } from '../../core/catalog/products';
import { commonAuthErrors } from '../../lib/core/api-error';
import { ownershipErrors } from '../../sync/ownership-constants';
import {
  catalogImageSchema,
  shortNameSchema,
} from '../../core/catalog/catalog.contract';
import { slugSchema } from './slug.contract';
import { CATALOG_ERRORS } from './catalog-errors';

/** A category as the management screen sees it, in a flat list the client
 * shapes into the tree. */
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
    shortName: shortNameSchema,
    /** The chip mark (FR-CAT-07). */
    mark: catalogImageSchema.nullable(),
    /** Everything beneath it, live and unpublished, as the grid filtered by
     * it lists (FR-ADM-19). */
    productCount: z.number().int().nonnegative(),
    /** Of `productCount`, the ones on the storefront. With none, the
     * storefront leaves the category out of its navigation. */
    liveProductCount: z.number().int().nonnegative(),
    /** Only the products filed in it, live and unpublished. */
    directProductCount: z.number().int().nonnegative(),
    /** Counted nowhere else, but they hold the restricting foreign key, so the
     * delete guard reads them too. */
    deletedProductCount: z.number().int().nonnegative(),
    childCount: z.number().int().nonnegative(),
  })
  .strict();
export type AdminCategory = z.infer<typeof adminCategorySchema>;

/** What create and update accept. A single move may set `parentId` here;
 * rearranging the tree goes through `reorderCategories`. */
export const categoryInputSchema = z
  .object({
    name: z.string().trim().min(1).max(CATEGORY_NAME_MAX_LENGTH),
    /** Empty is normalized to null, so "no nickname" has one spelling. */
    shortName: z
      .string()
      .trim()
      .max(CATEGORY_NAME_MAX_LENGTH)
      .nullable()
      .default(null)
      .transform((value) => value || null),
    /** As on a product: omitted derives on create and keeps on update. */
    slug: slugSchema.optional(),
    parentId: z.uuid().nullable().default(null),
    mark: catalogImageSchema.nullable().default(null),
    /**
     * Private sync key. Omitted keeps what is stored, `null` detaches the
     * category from the exchange, a string binds it. Created without one, it
     * has none: unlike a product, it is a container the shop invented.
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

/** One node's new place after a drag-drop rearrange. The whole set is applied
 * in one transaction, so the tree is never left half-reordered. */
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

/** A category collides on the same two unique columns a product does. */
const categoryIdentityErrors = {
  'slug-taken': CATALOG_ERRORS['slug-taken'],
  'source-id-taken': CATALOG_ERRORS['source-id-taken'],
  'slug-or-source-id-taken': CATALOG_ERRORS['slug-or-source-id-taken'],
} as const;

/** Every route here is admin-only. */
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
      // Name and source id are the exchange's while the catalog is owned;
      // nickname, parent and mark stay the shop's.
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
      'category-not-found': CATALOG_ERRORS['category-not-found'],
      'reassign-target-not-found': CATALOG_ERRORS['reassign-target-not-found'],
      'category-has-subcategories':
        CATALOG_ERRORS['category-has-subcategories'],
      'category-has-products': CATALOG_ERRORS['category-has-products'],
      'category-reassign-to-self': CATALOG_ERRORS['category-reassign-to-self'],
      // `reassignTo` while the catalog is owned: moving products writes a
      // field the exchange holds. Deleting an empty category is unaffected.
      'catalog-externally-owned': ownershipErrors['catalog-externally-owned'],
    })
    .input(
      z.object({
        params: z.object({ id: z.uuid() }),
        // Moves every product, soft-deleted ones included, to another category
        // first. Subcategories always block: reassigning never merges them.
        query: z.object({ reassignTo: z.uuid().optional() }),
      }),
    )
    .output(z.object({ message: z.string() })),

  reorderCategories: admin
    .route({
      method: 'PATCH',
      // No clash with `{id}`: nothing else answers PATCH here.
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
