import { initContract } from '@ts-rest/core';
import { z } from 'zod';

const c = initContract();

/**
 * The internal read API the storefront consumes — deliberately independent of
 * the file-sync import shape. What the legacy source file looks like never
 * leaks into these responses: the frontend sees clean, public shapes only.
 *
 * Nothing product-code-like is exposed. A product's stable legacy id
 * (`source_id`, the sync upsert key) is private and never serialized; the only
 * public handle is the `slug`, which is also what appears in URLs.
 */

/** Default page size for the product grid (FR-CAT-03). */
export const CATALOG_PAGE_SIZE = 24;

/**
 * One image in a gallery/carousel (FR-CAT-04/05). Order is the array order.
 * `alt` may be empty — it is presentation text an admin adds later, not always
 * present during the read path.
 */
export const catalogImageSchema = z
  .object({
    url: z.string(),
    alt: z.string(),
  })
  .strict();
export type CatalogImage = z.infer<typeof catalogImageSchema>;

/**
 * Price as an integer in the currency's minor unit (e.g. cents). The currency
 * and its formatting are a per-deployment concern (deployment config), not part
 * of this contract — the API stays currency-agnostic and free of float
 * rounding. A single price for now; tier-based price lists are FR-AUTH-05.
 */
export const priceMinorSchema = z.number().int().nonnegative();

/** A tile in the product grid (FR-CAT-04). */
export const productListItemSchema = z
  .object({
    slug: z.string(),
    name: z.string(),
    priceMinor: priceMinorSchema,
    images: z.array(catalogImageSchema),
  })
  .strict();
export type ProductListItem = z.infer<typeof productListItemSchema>;

/** A freetext key/value characteristic, detail page only (FR-CAT-05). */
export const productAttributeSchema = z
  .object({
    key: z.string(),
    value: z.string(),
  })
  .strict();
export type ProductAttribute = z.infer<typeof productAttributeSchema>;

/**
 * The rich-text vocabulary a product description may use — deliberately far
 * narrower than the static-page set (`RICH_TEXT_TAGS`): inline emphasis and
 * paragraphs only, no headings, lists, images or links. Declared here as the
 * shared contract; the sanitizer that enforces it lives with the product editor
 * (FR-ADM). On the read path the stored HTML is already trusted, same as pages.
 */
export const PRODUCT_RICH_TEXT_TAGS = ['p', 'br', 'strong', 'em'] as const;

/** The full product page (FR-CAT-05). */
export const productDetailSchema = z
  .object({
    slug: z.string(),
    name: z.string(),
    priceMinor: priceMinorSchema,
    /** Sanitized rich text, server-owned (same discipline as page bodies). */
    descriptionHtml: z.string(),
    images: z.array(catalogImageSchema),
    attributes: z.array(productAttributeSchema),
    /** The single category this product belongs to — for the breadcrumb. */
    category: z.object({ slug: z.string(), name: z.string() }).strict(),
  })
  .strict();
export type ProductDetail = z.infer<typeof productDetailSchema>;

/**
 * A node in the category tree (FR-CAT-01/02). The structure (name/hierarchy)
 * comes from the sync; `imageUrl` is the admin presentation overlay and may be
 * absent until one is attached. Recursive: subcategories nest arbitrarily,
 * though the UI may render only the depth it needs.
 */
export interface CategoryNode {
  slug: string;
  name: string;
  imageUrl: string | null;
  children: CategoryNode[];
}
export const categoryNodeSchema: z.ZodType<CategoryNode> = z.lazy(
  () =>
    z
      .object({
        slug: z.string(),
        name: z.string(),
        imageUrl: z.string().nullable(),
        children: z.array(categoryNodeSchema),
      })
      .strict(),
  // Cast: under the self-reference zod widens the inferred field types to
  // optional; the explicit interface above is the real shape.
) as z.ZodType<CategoryNode>;

/** A breadcrumb ancestor of the selected category, root-first. */
export const categoryCrumbSchema = z
  .object({ slug: z.string(), name: z.string() })
  .strict();

/** A direct child of the selected category, for the drill-down nav
 * (FR-CAT-02). `imageUrl` lets the nav render as tiles if wanted; the current
 * grid uses chips and ignores it. */
export const subcategoryLinkSchema = z
  .object({
    slug: z.string(),
    name: z.string(),
    imageUrl: z.string().nullable(),
  })
  .strict();
export type SubcategoryLink = z.infer<typeof subcategoryLinkSchema>;

/** Pagination envelope for the grid. */
export const paginationSchema = z
  .object({
    page: z.number().int().positive(),
    pageSize: z.number().int().positive(),
    total: z.number().int().nonnegative(),
    totalPages: z.number().int().nonnegative(),
  })
  .strict();
export type Pagination = z.infer<typeof paginationSchema>;

/** Query for the grid: 1-based page. Coerced — query values arrive as strings. */
export const productListQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
});

const notFoundSchema = z.object({ message: z.string() });

export const catalogContract = c.router({
  /** The full category tree for the main-page overview (FR-CAT-01/02). */
  getCategoryTree: {
    method: 'GET',
    path: '/catalog/categories',
    responses: {
      200: z.object({ categories: z.array(categoryNodeSchema) }).strict(),
    },
    summary: 'Get the full category tree',
  },
  /** Paginated products within a category (FR-CAT-03/04). */
  getCategoryProducts: {
    method: 'GET',
    path: '/catalog/categories/:slug/products',
    query: productListQuerySchema,
    responses: {
      200: z
        .object({
          /** The selected category, plus its ancestors for the breadcrumb. */
          category: z
            .object({
              slug: z.string(),
              name: z.string(),
              ancestors: z.array(categoryCrumbSchema),
              /** Direct children, for the drill-down nav. Empty on a leaf. */
              subcategories: z.array(subcategoryLinkSchema),
            })
            .strict(),
          items: z.array(productListItemSchema),
          pagination: paginationSchema,
        })
        .strict(),
      404: notFoundSchema,
    },
    summary: 'List products in a category (paginated)',
  },
  /** The full product page (FR-CAT-05). */
  getProduct: {
    method: 'GET',
    path: '/catalog/products/:slug',
    responses: {
      200: productDetailSchema,
      404: notFoundSchema,
    },
    summary: 'Get a product by slug',
  },
});
