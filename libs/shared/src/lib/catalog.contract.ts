import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import { ATTRIBUTE_FILTER_MAX_PARAMS } from './attribute-filter';
import {
  ATTRIBUTE_NAME_MAX_LENGTH,
  ATTRIBUTE_VALUE_MAX_LENGTH,
  attributeTypeSchema,
} from './attribute-value';

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
 * One image in a gallery/carousel (FR-CAT-04/05), as two media-store URLs:
 * `thumb` for grid/list (and search), `full` for the product page. Order is the
 * array order. No alt — the UI uses the product name.
 */
export const catalogImageSchema = z
  .object({
    full: z.string(),
    thumb: z.string(),
  })
  .strict();
export type CatalogImage = z.infer<typeof catalogImageSchema>;

/**
 * Price as an integer in the currency's minor unit (e.g. cents). The currency
 * and its formatting are a per-deployment concern (deployment config), not part
 * of this contract — the API stays currency-agnostic and free of float
 * rounding. Resolved server-side: which tier's list it came from (FR-AUTH-05)
 * and how many pieces the stored price covered are both invisible here.
 */
export const priceMinorSchema = z.number().int().nonnegative();

/**
 * What a product costs, per unit it can be bought in (FR-UNIT-05). `pack` and
 * `box` are null where the packaging does not define them, and both are exact:
 * purchasable quantities are whole multiples of the stored price's basis, so
 * nothing is rounded.
 *
 * `pieceMilliMinor` is the only sub-minor figure in the API — a single piece
 * cannot always be priced in cents (€19.99 for ten is €1.999 each). It is a
 * comparison figure for display: multiplying it will disagree with the server.
 * `pieceLotMinor` is the multiplicable one — what the smallest orderable piece
 * quantity (`packaging.minPieceQty`) costs, exactly — so a piece line's total
 * is computable without the price basis ever leaving the server. Null only
 * where the stored basis does not divide that quantity, which is a broken
 * invariant rather than a price of zero.
 */
export const unitPricesSchema = z
  .object({
    pieceMilliMinor: z.number().int().nonnegative(),
    pieceLotMinor: priceMinorSchema.nullable(),
    pack: priceMinorSchema.nullable(),
    box: priceMinorSchema.nullable(),
  })
  .strict();
export type UnitPrices = z.infer<typeof unitPricesSchema>;

/**
 * How the units nest, and the smallest piece quantity that may be ordered —
 * enough for the browser to correct a quantity without a round trip. The price
 * basis is deliberately absent: it is staff-facing, and the prices above are
 * already resolved to the unit each is labelled with.
 */
export const productPackagingSchema = z
  .object({
    piecesPerPack: z.number().int().positive().nullable(),
    packsPerBox: z.number().int().positive().nullable(),
    /** Minimum and increment for piece purchases; 1 means unconstrained. */
    minPieceQty: z.number().int().positive(),
  })
  .strict();
export type ProductPackagingInfo = z.infer<typeof productPackagingSchema>;

/**
 * A box's shipping facts. The dimensions are decimal strings, not numbers: they
 * are shown rather than calculated with, and a float round-trip would turn
 * 1.250 into 1.25.
 *
 * `count` is how many boxes the product ships as, and is informational only —
 * the volume and weight already cover the whole consignment, so nothing
 * multiplies by it (FR-UNIT-11).
 */
export const boxDimensionsSchema = z
  .object({
    volume: z.string().nullable(),
    weight: z.string().nullable(),
    count: z.number().int().positive(),
  })
  .strict();
export type BoxDimensions = z.infer<typeof boxDimensionsSchema>;

/** A tile in the product grid (FR-CAT-04). */
export const productListItemSchema = z
  .object({
    slug: z.string(),
    name: z.string(),
    /** The per-piece price rounded to whole minor units, as surfaces showed it
     * before units existed. Prefer `prices`; never an input to a total. */
    priceMinor: priceMinorSchema,
    prices: unitPricesSchema,
    packaging: productPackagingSchema,
    images: z.array(catalogImageSchema),
    /** Whether this product's line takes a free-text note (FR-CART-08). A
     * listing sells as readily as the product page does, so it has to know:
     * the buying controls ask for the note before the first add. */
    lineNoteEnabled: z.boolean(),
    /** The product's own wording for the note; null falls back to app-text. */
    lineNotePrompt: z.string().nullable(),
  })
  .strict();
export type ProductListItem = z.infer<typeof productListItemSchema>;

/**
 * A freetext key/value characteristic (FR-CAT-05) — as the admin enters it, and
 * as the admin API reads it back.
 */
export const productAttributeSchema = z
  .object({
    key: z.string(),
    value: z.string(),
  })
  .strict();
export type ProductAttribute = z.infer<typeof productAttributeSchema>;

/**
 * The same, as the product page reads it.
 *
 * `unit` is the declared attribute's unit where the key matches a definition
 * (FR-ATTR-01/02), and null everywhere else. The stored value never carries its
 * unit, which is what lets the spec table read "1000 g" from a value stored as
 * "1000" — joining the two is `formatAttributeValue`, shared with the facet
 * labels.
 *
 * `filterSlug` is the definition's slug, and is what turns the row into a link
 * into the filtered listing (FR-ATTR-08). It is null unless *this value* would
 * actually be offered as a facet: a number attribute's unparseable value is
 * still shown, but linking it would land on a listing that filters by something
 * no checkbox offers.
 *
 * Read-only, so it is deliberately not the shape the editor writes: both fields
 * belong to the definition, and a product save must not be able to set them.
 */
export const productDetailAttributeSchema = productAttributeSchema
  .extend({
    unit: z.string().nullable(),
    filterSlug: z.string().nullable(),
  })
  .strict();
export type ProductDetailAttribute = z.infer<
  typeof productDetailAttributeSchema
>;

/**
 * The rich-text vocabulary a product description may use — the static-page set
 * (`RICH_TEXT_TAGS`) minus headings, links and images: paragraphs, inline
 * emphasis (bold/italic/underline/strike), lists, block quotes and a divider.
 * Declared here as the shared contract; the sanitizer that enforces it lives
 * with the product editor (FR-ADM). On the read path the stored HTML is already
 * trusted, same as pages.
 */
export const PRODUCT_RICH_TEXT_TAGS = [
  'p',
  'br',
  'strong',
  'em',
  'u',
  's',
  'ul',
  'ol',
  'li',
  'blockquote',
  'hr',
] as const;

/**
 * An optional admin-set nickname, shown wherever the owning parent category is
 * already on screen — subcategory tiles and chips, breadcrumbs.
 */
export const shortNameSchema = z.string().nullable();

/** The name to display where the parent is visible: the nickname, or the full
 * name when there is none. */
export function categoryDisplayName(category: {
  name: string;
  shortName?: string | null;
}): string {
  return category.shortName || category.name;
}

/** A breadcrumb ancestor of the selected category, root-first. Carries the
 * nickname too: a crumb always sits next to its parent. */
export const categoryCrumbSchema = z
  .object({
    slug: z.string(),
    name: z.string(),
    shortName: shortNameSchema,
  })
  .strict();
export type CategoryCrumb = z.infer<typeof categoryCrumbSchema>;

/** The full product page (FR-CAT-05). */
export const productDetailSchema = z
  .object({
    slug: z.string(),
    name: z.string(),
    /** The rounded per-piece price; see `productListItemSchema`. */
    priceMinor: priceMinorSchema,
    prices: unitPricesSchema,
    packaging: productPackagingSchema,
    /** Null where the product has no box. */
    boxDimensions: boxDimensionsSchema.nullable(),
    /** Sanitized rich text, server-owned (same discipline as page bodies). */
    descriptionHtml: z.string(),
    images: z.array(catalogImageSchema),
    attributes: z.array(productDetailAttributeSchema),
    /** Whether the buying block offers a free-text note (FR-CART-08). */
    lineNoteEnabled: z.boolean(),
    /** The product's own wording for the note; null falls back to app-text. */
    lineNotePrompt: z.string().nullable(),
    /** The single category this product belongs to, with its own ancestors —
     * the breadcrumb shows the whole path, not just the leaf. */
    category: categoryCrumbSchema.extend({
      ancestors: z.array(categoryCrumbSchema),
    }),
  })
  .strict();
export type ProductDetail = z.infer<typeof productDetailSchema>;

/**
 * A node in the category tree (FR-CAT-01/02). The structure (name/hierarchy)
 * comes from the sync; `image` and `shortName` are the admin presentation
 * overlay and may be absent. Recursive: subcategories nest
 * arbitrarily, though the UI may render only the depth it needs.
 */
export interface CategoryNode {
  slug: string;
  name: string;
  shortName: string | null;
  image: CatalogImage | null;
  children: CategoryNode[];
}
export const categoryNodeSchema: z.ZodType<CategoryNode> = z.lazy(
  () =>
    z
      .object({
        slug: z.string(),
        name: z.string(),
        shortName: shortNameSchema,
        image: catalogImageSchema.nullable(),
        children: z.array(categoryNodeSchema),
      })
      .strict(),
  // Cast: under the self-reference zod widens the inferred field types to
  // optional; the explicit interface above is the real shape.
) as z.ZodType<CategoryNode>;

/** A direct child of the selected category, for the drill-down nav
 * (FR-CAT-02). `image` lets the nav render as tiles if wanted; the current grid
 * uses chips and ignores it. */
export const subcategoryLinkSchema = z
  .object({
    slug: z.string(),
    name: z.string(),
    shortName: shortNameSchema,
    image: catalogImageSchema.nullable(),
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

/**
 * How a product listing is ordered (FR-SEARCH-04). Name and price, each in both
 * directions — the only two fields a tile shows that a visitor can meaningfully
 * order by. Every sort is total: the server appends name and id as tiebreakers,
 * so a row cannot swap pages between requests.
 */
export const productSortSchema = z.enum([
  'name',
  'name_desc',
  'price',
  'price_desc',
]);
export type ProductSort = z.infer<typeof productSortSchema>;

/**
 * The same, plus relevance — only meaningful where there is a query to be
 * relevant to, so it exists on the search endpoint alone rather than as a
 * fourth option the category listing has to reject.
 */
export const searchSortSchema = z.enum([
  'relevance',
  ...productSortSchema.options,
]);
export type SearchSort = z.infer<typeof searchSortSchema>;

/** Longest `attr` entry: a slug, the separator, and a value. */
const ATTRIBUTE_FILTER_PARAM_MAX_LENGTH =
  ATTRIBUTE_NAME_MAX_LENGTH + 1 + ATTRIBUTE_VALUE_MAX_LENGTH;

/**
 * The selected attribute values (FR-ATTR-05/07), one entry per value as
 * `<definition-slug>:<value>` — see `attribute-filter.ts` for why the values
 * are not packed into one parameter.
 *
 * Three shapes, because a query string has no array type and every layer
 * spells one differently: a single entry arrives as a bare string, the ts-rest
 * client writes `attr[0]=…` (qs index notation), and qs hands back an
 * object rather than an array once there are more than 20 of either. All three
 * normalize to a list here, so the panel is never one checkbox away from a 400.
 *
 * Entries naming an attribute nobody declared are ignored server-side rather
 * than refused: a link outlives the definition it was written from.
 */
export const attributeParamSchema = z
  .union([z.string(), z.array(z.string()), z.record(z.string(), z.string())])
  .optional()
  .transform((value) => {
    if (value === undefined) return [];
    if (typeof value === 'string') return [value];
    return Array.isArray(value) ? value : Object.values(value);
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
 * definition. A category listing defaults to name (FR-SEARCH-04).
 */
export const productListQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  sort: productSortSchema.optional().default('name'),
  attr: attributeParamSchema,
});

/**
 * Upper bound on a search term. Longer than any real product query,
 * short enough that no caller can hand the matcher an expensive string.
 * Rejected at the contract rather than truncated, so an over-long query is an
 * explainable 400 instead of silently searching for something else — the search
 * bar caps its own input at the same number.
 */
export const SEARCH_QUERY_MAX_LENGTH = 100;

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
 * How many names the search bar's suggestion list offers (FR-SEARCH-05).
 * Enforced server-side and exported so the UI can size the list without
 * guessing. Short on purpose: suggestions are an accelerator, and a list long
 * enough to need scanning is slower than reading the result page.
 */
export const SEARCH_SUGGESTION_LIMIT = 5;

/**
 * Query for the suggestion list. Just `q`: there is no paging past the first
 * few matches, and the limit is not the caller's to choose.
 */
export const searchSuggestionQuerySchema = z.object({
  q: z.string().max(SEARCH_QUERY_MAX_LENGTH).optional().default(''),
});

/**
 * One suggestion: the name to show and the slug to go to. No price or image —
 * picking a suggestion navigates straight to the product, so the row only has
 * to be recognizable, and keeping it this narrow is what makes the query cheap
 * enough to run while the visitor is still typing.
 */
export const searchSuggestionSchema = z
  .object({ slug: z.string(), name: z.string() })
  .strict();
export type SearchSuggestion = z.infer<typeof searchSuggestionSchema>;

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
      404: notFoundSchema,
    },
    summary: 'List products in a category (paginated)',
  },
  /**
   * Product search by name (FR-SEARCH-01…03), ordered by relevance unless the
   * caller asks for another sort (FR-SEARCH-04). Its own
   * endpoint rather than a mode of the category listing: there is no category
   * to describe, so the response carries no breadcrumb or subcategory envelope
   * — just the same product tiles the grid renders, in match order.
   */
  searchProducts: {
    method: 'GET',
    path: '/catalog/search',
    query: productSearchQuerySchema,
    responses: {
      200: z
        .object({
          items: z.array(productListItemSchema),
          pagination: paginationSchema,
          facets: z.array(facetSchema),
        })
        .strict(),
    },
    summary: 'Search products by name, best match first',
  },
  /**
   * Type-ahead suggestions for the search bar (FR-SEARCH-05). The same matcher
   * and the same ordering as `searchProducts`, so the list is a truthful prefix
   * of what submitting the query would show — but without the total count or
   * the tile payload, which is what keeps it cheap enough to call per
   * keystroke. Suggestions are an accelerator only: the full result list stays
   * reachable by submitting.
   */
  getSearchSuggestions: {
    method: 'GET',
    path: '/catalog/search/suggestions',
    query: searchSuggestionQuerySchema,
    responses: {
      200: z.object({ items: z.array(searchSuggestionSchema) }).strict(),
    },
    summary: 'Suggest product names for a partial query',
  },
  /**
   * Every indexable slug for the sitemap (NFR-SEO-02) — all categories and all
   * non-deleted products, each with its `updatedAt`. Consumed only by the SSR
   * server to build sitemap.xml; the maintenance guard gates it like the rest
   * of the storefront read API (ADR 0022), so it 503s while the site is gated.
   */
  getSitemap: {
    method: 'GET',
    path: '/catalog/sitemap',
    responses: {
      200: z
        .object({
          categories: z.array(sitemapEntrySchema),
          products: z.array(sitemapEntrySchema),
          pages: z.array(sitemapEntrySchema),
        })
        .strict(),
    },
    summary: 'List all indexable slugs for the sitemap',
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
