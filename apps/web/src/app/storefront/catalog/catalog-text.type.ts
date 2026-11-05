import type { DeepReadonly } from '@b2b-catalog-platform/shared/platform';
import * as z from 'zod';

/** The catalog's block of `texts/storefront.json`. */
export const storefrontCatalogTextShape = {
  /** Storefront catalog chrome (FR-CAT). */
  listing: z
    .object({
      emptyCategories: z.string(),
      loadError: z.string(),
      emptyProducts: z.string(),
      /** How many products the listing is showing, above the grid. Counts,
       * so it may carry both forms; `{count}` substituted at render. */
      productCount: z.string(),
      /** The cards/lines toggle (FR-CAT-04): two glyphs, so these are the
       * buttons' accessible names. */
      layout: z
        .object({
          labelAria: z.string(),
          grid: z.string(),
          list: z.string(),
        })
        .strict(),
      /** The sort control (FR-SEARCH-04), keyed by the contract's sort values.
       * `relevance` shows on search only, `category` on the whole catalogue only. */
      sort: z
        .object({
          /** Caption beside the control. */
          label: z.string(),
          relevance: z.string(),
          category: z.string(),
          name: z.string(),
          name_desc: z.string(),
          price: z.string(),
          price_desc: z.string(),
          /** The segments above a listing, the direction an arrow beside them; the
           * full wording stays each one's accessible name. */
          fields: z
            .object({
              relevance: z.string(),
              category: z.string(),
              name: z.string(),
              price: z.string(),
            })
            .strict(),
        })
        .strict(),
      /** The filter panel and its chips (FR-ATTR-04…07). `selected` is the
       * narrow toggle's count, in brackets so it reads as a count. */
      filters: z
        .object({
          title: z.string(),
          /** `{count}` is the number of ticked values across all facets. */
          selected: z.string(),
          clearAll: z.string(),
          /** Accessible name of the chip row. */
          appliedAria: z.string(),
          /** A chip's remove button; `{label}` is "Attribute: value". */
          removeAria: z.string(),
          /** In the grid's place when a selection matches nothing, beside the
           * panel that can undo it. */
          noMatches: z.string(),
        })
        .strict(),
      productNotFound: z.string(),
      categoryNotFound: z.string(),
      /** Back link on the catalogue's 404 screens. */
      backToCatalog: z.string(),
    })
    .strict(),
  /** Product search: the navbar bar and its results page (FR-SEARCH). */
  search: z
    .object({
      /** Placeholder in the navbar field, and its accessible name. */
      placeholder: z.string(),
      /** Accessible name of the submit control and the mobile toggle. */
      submit: z.string(),
      openSearch: z.string(),
      closeSearchAria: z.string(),
      clearAria: z.string(),
      /** Landmark name for the search form. */
      searchNavAria: z.string(),
      /** Accessible name of the suggestion list (FR-SEARCH-05). */
      suggestionsAria: z.string(),
      /** Announced as suggestions appear (`{count}`); the list is its visual form. */
      suggestionCountAria: z.string(),
      /** A status inside the dropdown, so terser than the results page's. */
      noSuggestions: z.string(),
      /** Accessible name of the row of category chips (FR-SEARCH-07). */
      categoriesLabel: z.string(),
      /** The panel's way to the results page, where submitting goes. */
      showAllResults: z.string(),
      /** Accessible name of a suggestion's icon-only add button
       * (FR-SEARCH-06); `{name}` is the product's. */
      addSuggestionAria: z.string(),
      /** Accessible name of the mark that replaces it once the product is
       * in the cart; `{name}` is the product's. */
      suggestionInCartAria: z.string(),
      /** Results heading; `{query}` is substituted. */
      resultsTitle: z.string(),
      /** Result count; `{count}` is substituted. Shown for one or more hits. */
      resultCount: z.string(),
      /** Shown when a query matched nothing; `{query}` is substituted. */
      noResults: z.string(),
      /** Advice under the no-results line: spelling, fewer words. */
      noResultsHint: z.string(),
      /** Shown when the page is opened with no query at all. */
      emptyQuery: z.string(),
      loadError: z.string(),
    })
    .strict(),
  /** The row of products above the categories (FR-CAT-09). Its heading
   * must not promise a selection: most of the row is often drawn at
   * random. */
  featured: z
    .object({
      heading: z.string(),
      /** The arrow buttons' accessible names; a mouse has no other way
       * to move a row that scrolls sideways. */
      previousAria: z.string(),
      nextAria: z.string(),
    })
    .strict(),
};

export type StorefrontCatalogText = DeepReadonly<
  z.infer<z.ZodObject<typeof storefrontCatalogTextShape>>
>;
