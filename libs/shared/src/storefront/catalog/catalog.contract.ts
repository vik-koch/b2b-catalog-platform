import { oc } from '@orpc/contract';
import * as z from 'zod';
import { paginationSchema } from '../../platform/pagination.contract';
import { ATTRIBUTE_FILTER_MAX_PARAMS } from '../../core/catalog/attribute-filter';
import {
  ATTRIBUTE_NAME_MAX_LENGTH,
  ATTRIBUTE_VALUE_MAX_LENGTH,
} from '../../core/catalog/attributes';
import {
  PRODUCT_SORTS,
  SEARCH_SORTS,
  SearchSort,
} from '../../core/catalog/product-sort';
import { SEARCH_QUERY_MAX_LENGTH } from '../../core/catalog/search';
import {
  attributeTypeSchema,
  type CatalogImage,
  catalogImageSchema,
  categoryCrumbSchema,
  productDetailSchema,
  productListItemSchema,
  shortNameSchema,
} from '../../core/catalog/catalog.contract';
import { CATALOG_SORTS } from './catalog-constants';

/**
 * A category's mark (FR-CAT-07): the small square image beside its name on the
 * chip. Null for most categories.
 */
export const categoryMarkSchema = catalogImageSchema.nullable();

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
 * A node in the category tree (FR-CAT-01/02). The structure (name/hierarchy)
 * comes from the sync; `mark` and `shortName` are the admin
 * presentation overlay and may be absent. Recursive: subcategories nest
 * arbitrarily, though the UI may render only the depth it needs.
 */
export interface CategoryNode {
  slug: string;
  name: string;
  shortName: string | null;
  mark: CatalogImage | null;
  children: CategoryNode[];
}
export const categoryNodeSchema: z.ZodType<CategoryNode> = z.lazy(
  () =>
    z
      .object({
        slug: z.string(),
        name: z.string(),
        shortName: shortNameSchema,
        mark: categoryMarkSchema,
        children: z.array(categoryNodeSchema),
      })
      .strict(),
  // Cast: under the self-reference zod widens the inferred field types to
  // optional; the explicit interface above is the real shape.
) as z.ZodType<CategoryNode>;

/** A direct child of the selected category, for the drill-down nav
 * (FR-CAT-02), drawn as a chip with its `mark` (FR-CAT-07).
 *
 * `attr` is the part of the listing's selection the child's own panel offers
 * — what its link carries — and `count` the products that part leaves beneath
 * it (FR-ATTR-13). */
export const subcategoryLinkSchema = z
  .object({
    slug: z.string(),
    name: z.string(),
    shortName: shortNameSchema,
    mark: categoryMarkSchema,
    count: z.number().int().nonnegative(),
    attr: z.array(z.string()),
  })
  .strict();
export type SubcategoryLink = z.infer<typeof subcategoryLinkSchema>;

export const productSortSchema = z.enum(PRODUCT_SORTS);

export const searchSortSchema = z.enum(SEARCH_SORTS);

export const catalogSortSchema = z.enum(CATALOG_SORTS);
export type CatalogSort = (typeof CATALOG_SORTS)[number];

/** Any listing's sort — what the shared sort control speaks. */
export type ListingSort = SearchSort | CatalogSort;

/** Longest `attr` entry: a slug, the separator, and a value. */
const ATTRIBUTE_FILTER_PARAM_MAX_LENGTH =
  ATTRIBUTE_NAME_MAX_LENGTH + 1 + ATTRIBUTE_VALUE_MAX_LENGTH;

/**
 * The selected attribute values (FR-ATTR-05/07), one entry per value as
 * `<definition-slug>:<value>` — see `attribute-filter.ts` for why the values
 * are not packed into one parameter.
 *
 * Two shapes, because a query string has no array type: a single entry arrives
 * as a bare string, and anything more as a list. The client writes `attr[0]=…`
 * and the contract layer reads that, `attr[]=…` and a repeated `attr=…` all
 * back as a list, at any length — so the panel is never one checkbox away from
 * a 400, and a hand-written or bookmarked URL in any of the three works.
 *
 * Entries naming an attribute nobody declared are ignored server-side rather
 * than refused: a link outlives the definition it was written from.
 */
export const attributeParamSchema = z
  .union([z.string(), z.array(z.string())])
  .optional()
  .transform((value) => {
    if (value === undefined) return [];
    return typeof value === 'string' ? [value] : value;
  })
  .pipe(
    z
      .array(z.string().max(ATTRIBUTE_FILTER_PARAM_MAX_LENGTH))
      .max(ATTRIBUTE_FILTER_MAX_PARAMS),
  );

/**
 * One selectable value of a facet, with the number of products it would leave
 * (FR-ATTR-04). The count is taken with every *other* attribute's selection
 * applied but not this attribute's own — otherwise clicking one value would
 * collapse its own list to that value. A zero count is rendered disabled, not
 * hidden (FR-ATTR-05).
 *
 * The value is the raw text staff typed; the unit lives on the facet, and
 * joining the two is the caller's business — the same string has to render in
 * the spec table and the facet label alike.
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
 * One filterable attribute present among the products in scope (FR-ATTR-04),
 * in the registry's panel order. `slug` is what the URL is written with and
 * survives a rename, so a shared filtered link keeps working.
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
 * Query for the grid: 1-based page and a sort. Coerced — query values arrive as
 * strings. Both default here rather than in the UI, so an omitted parameter and
 * an explicit default mean the same thing and the shared default sort has one
 * definition. A listing defaults to grouping by category (FR-SEARCH-04), which
 * on a category with no subcategories is its name order.
 */
export const productListQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  sort: catalogSortSchema.optional().default('category'),
  attr: attributeParamSchema,
});

/**
 * Search query (FR-SEARCH-01…03). `q` is free text and may be anything a
 * visitor types: the server tokenizes it, and a query with nothing searchable
 * in it (blank, punctuation only, one character) is answered with an empty
 * page, not an error — an empty result is the honest answer to "no matches",
 * and the UI renders it the same way either way.
 */
export const productSearchQuerySchema = z.object({
  q: z.string().max(SEARCH_QUERY_MAX_LENGTH).optional().default(''),
  page: z.coerce.number().int().positive().optional().default(1),
  sort: searchSortSchema.optional().default('relevance'),
  attr: attributeParamSchema,
});

/**
 * How many products the search bar's suggestion list offers (FR-SEARCH-05).
 * Enforced server-side and exported so the UI can size the list without
 * guessing. More than the panel shows at once — it scrolls — because a row
 * can be added to the cart from where it is (FR-SEARCH-06), and filling a cart
 * from one query is worth a few rows more than a glance's worth.
 */
export const SEARCH_SUGGESTION_LIMIT = 10;

/**
 * Query for the suggestion list. Just `q`: there is no paging past the first
 * few matches, and the limit is not the caller's to choose.
 */
export const searchSuggestionQuerySchema = z.object({
  q: z.string().max(SEARCH_QUERY_MAX_LENGTH).optional().default(''),
});

/**
 * A category whose name the query matched (FR-SEARCH-07), drawn as a chip. The
 * parent's name is its context: a leaf's own name is often not unique across
 * the tree ("Accessories" under two branches), and its short name is the one
 * written for a place where the parent is visible. Null for a top-level one.
 */
export const searchCategorySchema = z
  .object({
    slug: z.string(),
    name: z.string(),
    shortName: shortNameSchema,
    mark: categoryMarkSchema,
    parent: z.string().nullable(),
  })
  .strict();
export type SearchCategory = z.infer<typeof searchCategorySchema>;

/**
 * One indexable URL for the sitemap (NFR-SEO-02): a slug and the row's
 * `updatedAt` as an ISO string, used for `<lastmod>`. The SSR server turns
 * these into absolute `/catalog/:slug` and `/product/:slug` URLs;
 * this endpoint stays origin-agnostic and exposes no other product data.
 */
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

  /**
   * Every publicly visible product, paginated (FR-CAT-02/03) — the listing
   * the catalogue index is, one level above any category. The same query as
   * a category's, and the top-level categories in place of its subcategories;
   * no ancestors, because nothing is above it.
   */
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
          category: z
            .object({
              slug: z.string(),
              name: z.string(),
              shortName: shortNameSchema,
              ancestors: z.array(categoryCrumbSchema),
              /** Direct children, for the drill-down nav. Empty on a leaf. */
              subcategories: z.array(subcategoryLinkSchema),
            })
            .strict(),
          items: z.array(productListItemSchema),
          pagination: paginationSchema,
          facets: z.array(facetSchema),
        })
        .strict(),
    ),

  /**
   * Product search by name (FR-SEARCH-01…03), ordered by relevance unless the
   * caller asks for another sort (FR-SEARCH-04). Its own
   * endpoint rather than a mode of the category listing: there is no category
   * to describe, so the response carries no breadcrumb or subcategory envelope
   * — just the same product tiles the grid renders, in match order.
   */
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
   * Type-ahead suggestions for the search bar (FR-SEARCH-05/06/07), with the
   * categories whose names the query matched beside them. The same
   * matcher, the same ordering and the same tier-resolved tiles as
   * `searchProducts`, so the list is a truthful prefix of what submitting the
   * query would show — without the total count and the facets, which is what
   * keeps it cheap enough to call per keystroke. Whole tiles, because a row
   * shows the picture and the price and can put the product in the cart.
   * Suggestions are an accelerator only: the full result list stays reachable
   * by submitting.
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

  /**
   * Every indexable slug for the sitemap (NFR-SEO-02) — all categories and all
   * non-deleted products, each with its `updatedAt`. Consumed only by the SSR
   * server to build sitemap.xml; the maintenance guard gates it like the rest
   * of the storefront read API (ADR 0022), so it 503s while the site is gated.
   */
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
   * The main page's row (FR-CAT-09): the featured products first, the rest of
   * the row filled from the catalog, drawn at random and never out of stock.
   * Which entries were featured is not said — the row is shuffled, and the
   * items are the same list items every listing carries.
   *
   * An empty list where nothing can be shown; the page leaves the row out.
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
   * The products a product is sold together with (FR-SET-05), as tiles that can
   * be bought from where they are listed.
   *
   * Its own request rather than a field on the product: the marker is drawn
   * from `pairedCount` on every card in a listing, and fetching every card's
   * counterparts to draw an icon would price a listing several times over. This
   * is asked once, for the one product whose marker was pressed.
   *
   * A product with no counterparts answers with an empty list rather than a
   * 404 — it exists, and it is sold with nothing.
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
