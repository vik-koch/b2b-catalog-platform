import { Injectable } from '@angular/core';
import {
  ProductSort,
  SearchSort,
  SearchSuggestion,
} from '@b2b-catalog-platform/shared';
import { catalogContract } from '../core/contract-routes.generated';
import { safe } from '@orpc/client';
import { createOrpcClient, deferSessionReads } from '../core/orpc-client';

@Injectable({ providedIn: 'root' })
export class CatalogService {
  private client = createOrpcClient(catalogContract);
  /**
   * Prices depend on the caller's tier (FR-AUTH-05), so the reads carrying them
   * answer `undefined` on a server render for a signed-in visitor: the browser
   * fills the page in with their own prices instead of the default ones being
   * painted first. Guests and crawlers are unaffected.
   */
  private readonly deferPrices = deferSessionReads();

  /** The full category tree for the main-page overview (FR-CAT-01/02). */
  async getCategoryTree() {
    return (await this.client.getCategoryTree()).categories;
  }

  /** A page of products in a category (FR-CAT-03/04). `null` when the category
   * does not exist, so the caller can render a not-found rather than throw;
   * `undefined` when this render defers prices — see `deferPrices`. */
  async getCategoryProducts(
    slug: string,
    page: number,
    sort: ProductSort,
    attr: string[] = [],
  ) {
    if (this.deferPrices) return undefined;
    const result = await safe(
      this.client.getCategoryProducts({
        params: { slug },
        query: { page, sort, attr },
      }),
    );
    if (result.isDefined) return null;
    if (!result.isSuccess) throw result.error;
    return result.data;
  }

  /** A page of search results, best match first (FR-SEARCH-01…03). An
   * unsearchable query is an empty page, not an error — see the contract. */
  async searchProducts(
    q: string,
    page: number,
    sort: SearchSort,
    attr: string[] = [],
  ) {
    if (this.deferPrices) return undefined;
    return this.client.searchProducts({ query: { q, page, sort, attr } });
  }

  /**
   * Type-ahead suggestions for the search bar (FR-SEARCH-05). Failures are
   * answered with an empty list rather than thrown: suggestions are an
   * accelerator, and a dropdown that cannot load is a reason to show nothing,
   * not to interrupt someone mid-query.
   */
  async getSearchSuggestions(q: string): Promise<SearchSuggestion[]> {
    const { error, data } = await safe(
      this.client.getSearchSuggestions({ query: { q } }),
    );
    return error ? [] : data.items;
  }

  /** A single product (FR-CAT-05). `null` when it does not exist, `undefined`
   * when this render defers prices — see `deferPrices`. */
  async getProduct(slug: string) {
    if (this.deferPrices) return undefined;
    const result = await safe(this.client.getProduct({ params: { slug } }));
    if (result.isDefined) return null;
    if (!result.isSuccess) throw result.error;
    return result.data;
  }
}
