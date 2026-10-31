/**
 * The storefront's read API. A product's sync key is private and never sent:
 * the slug is its only public handle.
 */

import { oc } from '@orpc/contract';
import * as z from 'zod';
import { listParam } from '../../platform/list-param.contract';
import {
  pageParamSchema,
  paginationSchema,
} from '../../platform/pagination.contract';
import { ATTRIBUTE_FILTER_MAX_PARAMS } from '../../core/catalog/attribute-filter';
import {
  ATTRIBUTE_NAME_MAX_LENGTH,
  ATTRIBUTE_VALUE_MAX_LENGTH,
} from '../../core/catalog/attributes';
import { PRODUCT_SORTS, SEARCH_SORTS } from '../../core/catalog/product-sort';
import { searchQueryParamSchema } from '../../core/catalog/search.contract';
import {
  attributeTypeSchema,
  type CatalogImage,
  catalogImageSchema,
  categoryCrumbSchema,
  productDetailSchema,
  productListItemSchema,
} from '../../core/catalog/catalog.contract';
import { CATALOG_SORTS } from './listing';

/**
 * A category's mark (FR-CAT-07): the small square image beside its name on the
 * chip. Null for most categories.
 */
export const categoryMarkSchema = catalogImageSchema.nullable();

/** A category as its chip draws it, wherever it appears (FR-CAT-07). */
const categoryChipSchema = categoryCrumbSchema
  .extend({ mark: categoryMarkSchema })
  .strict();

/** A node in the category tree (FR-CAT-01/02), nesting to any depth. */
export interface CategoryNode {
  slug: string;
  name: string;
  shortName: string | null;
  mark: CatalogImage | null;
  children: CategoryNode[];
}
export const categoryNodeSchema: z.ZodType<CategoryNode> = z.lazy(
  () =>
    categoryChipSchema
      .extend({ children: z.array(categoryNodeSchema) })
      .strict(),
  // Cast: under the self-reference zod widens the inferred field types to
  // optional; the explicit interface above is the real shape.
) as z.ZodType<CategoryNode>;

/**
 * A direct child of the selected category, for the drill-down nav (FR-CAT-02).
 * `attr` is the part of the selection the child's own panel offers, which its
 * link carries, and `count` the products that part leaves (FR-ATTR-13).
 */
export const subcategoryLinkSchema = categoryChipSchema
  .extend({
    count: z.number().int().nonnegative(),
    attr: z.array(z.string()),
  })
  .strict();
export type SubcategoryLink = z.infer<typeof subcategoryLinkSchema>;

export const productSortSchema = z.enum(PRODUCT_SORTS);

export const searchSortSchema = z.enum(SEARCH_SORTS);

export const catalogSortSchema = z.enum(CATALOG_SORTS);

/** Longest `attr` entry: a slug, the separator, and a value. */
const ATTRIBUTE_FILTER_PARAM_MAX_LENGTH =
  ATTRIBUTE_NAME_MAX_LENGTH + 1 + ATTRIBUTE_VALUE_MAX_LENGTH;

/**
 * The selected attribute values (FR-ATTR-05/07), one `attr` entry per value
 * (`attribute-filter.ts`). An entry naming an undeclared attribute is ignored
 * rather than refused: a link outlives the definition it was written from.
 */
export const attributeParamSchema = listParam(
  z.string().max(ATTRIBUTE_FILTER_PARAM_MAX_LENGTH),
).pipe(z.array(z.string()).max(ATTRIBUTE_FILTER_MAX_PARAMS));

/**
 * One selectable value of a facet with the products it would leave
 * (FR-ATTR-04): counted under every other attribute's selection but not its
 * own, or one click would collapse its list. The value is the stored text; the
 * unit is on the facet (`formatAttributeValue`).
 */
export const facetValueSchema = z
  .object({
    value: z.string(),
    count: z.number().int().nonnegative(),
    selected: z.boolean(),
  })
  .strict();
export type FacetValue = z.infer<typeof facetValueSchema>;

/**
 * One filterable attribute among the products in scope (FR-ATTR-04), in panel
 * order. URLs use the `slug`, which survives a rename.
 */
export const facetSchema = z
  .object({
    slug: z.string(),
    name: z.string(),
    type: attributeTypeSchema,
    unit: z.string().nullable(),
    values: z.array(facetValueSchema),
  })
  .strict();
export type Facet = z.infer<typeof facetSchema>;

/**
 * A listing's query. Defaults live here rather than in the UI, so an omitted
 * parameter and the default mean the same; the sort groups by category
 * (FR-SEARCH-04).
 */
export const productListQuerySchema = z.object({
  page: pageParamSchema,
  sort: catalogSortSchema.optional().default('category'),
  attr: attributeParamSchema,
});

/** A search's query (FR-SEARCH-01…03). */
export const productSearchQuerySchema = z.object({
  q: searchQueryParamSchema,
  page: pageParamSchema,
  sort: searchSortSchema.optional().default('relevance'),
  attr: attributeParamSchema,
});

/** The suggestion list's query: no paging, and no limit for the caller. */
export const searchSuggestionQuerySchema = z.object({
  q: searchQueryParamSchema,
});

/**
 * A category whose name the query matched (FR-SEARCH-07). `parent` names its
 * context, since a leaf's name is often not unique ("Accessories" under two
 * branches); null for a top-level one.
 */
export const searchCategorySchema = categoryChipSchema
  .extend({ parent: z.string().nullable() })
  .strict();
export type SearchCategory = z.infer<typeof searchCategorySchema>;

/** One indexable URL for the sitemap (NFR-SEO-02), with `updatedAt` for
 * `<lastmod>`. The SSR server makes the absolute URLs. */
export const sitemapEntrySchema = z
  .object({ slug: z.string(), updatedAt: z.string() })
  .strict();
export type SitemapEntry = z.infer<typeof sitemapEntrySchema>;

/** The storefront's only refusal: a slug nothing answers to. */
const notFound = { 'not-found': { status: 404 } } as const;

export const catalogContract = {
  /** The full category tree for the main-page overview (FR-CAT-01/02). */
  getCategoryTree: oc
    .route({
      method: 'GET',
      path: '/catalog/categories',
      summary: 'Get the full category tree',
    })
    .output(z.object({ categories: z.array(categoryNodeSchema) }).strict()),

  /** The catalogue index (FR-CAT-02/03): a category's listing one level up,
   * with the top-level categories as its subcategories. */
  getCatalogProducts: oc
    .route({
      method: 'GET',
      path: '/catalog/products',
      inputStructure: 'detailed',
      summary: 'List every product in the catalogue (paginated)',
    })
    .input(z.object({ query: productListQuerySchema }))
    .output(
      z
        .object({
          /** The top-level categories, for the drill-down nav. */
          categories: z.array(subcategoryLinkSchema),
          items: z.array(productListItemSchema),
          pagination: paginationSchema,
          facets: z.array(facetSchema),
        })
        .strict(),
    ),

  /** Paginated products within a category (FR-CAT-03/04). */
  getCategoryProducts: oc
    .route({
      method: 'GET',
      path: '/catalog/categories/{slug}/products',
      inputStructure: 'detailed',
      summary: 'List products in a category (paginated)',
    })
    .errors(notFound)
    .input(
      z.object({
        params: z.object({ slug: z.string() }),
        query: productListQuerySchema,
      }),
    )
    .output(
      z
        .object({
          /** The selected category, plus its ancestors for the breadcrumb. */
          category: categoryCrumbSchema
            .extend({
              ancestors: z.array(categoryCrumbSchema),
              /** Empty on a leaf. */
              subcategories: z.array(subcategoryLinkSchema),
            })
            .strict(),
          items: z.array(productListItemSchema),
          pagination: paginationSchema,
          facets: z.array(facetSchema),
        })
        .strict(),
    ),

  /** Product search by name (FR-SEARCH-01…04). Not a mode of the listing:
   * there is no category to describe. */
  searchProducts: oc
    .route({
      method: 'GET',
      path: '/catalog/search',
      inputStructure: 'detailed',
      summary: 'Search products by name, best match first',
    })
    .input(z.object({ query: productSearchQuerySchema }))
    .output(
      z
        .object({
          items: z.array(productListItemSchema),
          pagination: paginationSchema,
          facets: z.array(facetSchema),
        })
        .strict(),
    ),

  /**
   * Type-ahead suggestions (FR-SEARCH-05/06/07): a prefix of what
   * `searchProducts` would show, without the count and facets that would make
   * it too costly per keystroke. Whole tiles, since a row can add to the cart.
   */
  getSearchSuggestions: oc
    .route({
      method: 'GET',
      path: '/catalog/search/suggestions',
      inputStructure: 'detailed',
      summary: 'Suggest products and categories for a partial query',
    })
    .input(z.object({ query: searchSuggestionQuerySchema }))
    .output(
      z
        .object({
          items: z.array(productListItemSchema),
          categories: z.array(searchCategorySchema),
        })
        .strict(),
    ),

  /** Every indexable slug, for the SSR server's sitemap.xml (NFR-SEO-02).
   * Gated by maintenance like the rest of this API. */
  getSitemap: oc
    .route({
      method: 'GET',
      path: '/catalog/sitemap',
      summary: 'List all indexable slugs for the sitemap',
    })
    .output(
      z
        .object({
          categories: z.array(sitemapEntrySchema),
          products: z.array(sitemapEntrySchema),
          pages: z.array(sitemapEntrySchema),
        })
        .strict(),
    ),

  /**
   * The main page's row (FR-CAT-09): featured products first, filled from the
   * catalog, drawn at random and never out of stock. Shuffled, so which were
   * featured is not said. Empty where nothing can be shown.
   */
  getFeaturedProducts: oc
    .route({
      method: 'GET',
      path: '/catalog/featured',
      summary: 'Draw the products for the main page row',
    })
    .output(z.object({ items: z.array(productListItemSchema) }).strict()),

  /** The full product page (FR-CAT-05). */
  getProduct: oc
    .route({
      method: 'GET',
      path: '/catalog/products/{slug}',
      inputStructure: 'detailed',
      summary: 'Get a product by slug',
    })
    .errors(notFound)
    .input(z.object({ params: z.object({ slug: z.string() }) }))
    .output(productDetailSchema),

  /**
   * The products a product is sold together with (FR-SET-05), as buyable
   * tiles. Its own request, asked when a marker is pressed: fetching every
   * card's counterparts would price a listing several times over.
   */
  getProductPairings: oc
    .route({
      method: 'GET',
      path: '/catalog/products/{slug}/pairings',
      inputStructure: 'detailed',
      summary: 'List the products a product is sold together with',
    })
    .errors(notFound)
    .input(z.object({ params: z.object({ slug: z.string() }) }))
    .output(z.object({ items: z.array(productListItemSchema) }).strict()),
};
