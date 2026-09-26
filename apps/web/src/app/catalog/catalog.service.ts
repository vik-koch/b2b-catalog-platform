import { Injectable } from '@angular/core';
import {
  ProductSort,
  SearchSort,
  SearchSuggestion,
} from '@b2b-catalog-platform/shared';
import { catalogContract } from '../core/contract-routes.generated';
import { safe } from '@orpc/client';
import { createOrpcClient } from '../core/orpc-client';

@Injectable({ providedIn: 'root' })
export class CatalogService {
  private client = createOrpcClient(catalogContract);

  /** The full category tree for the main-page overview (FR-CAT-01/02). */
  async getCategoryTree() {
    return (await this.client.getCategoryTree()).categories;
  }

  /** A page of products in a category (FR-CAT-03/04). `null` when the category
   * does not exist, so the caller can render a not-found rather than throw. */
  async getCategoryProducts(
    slug: string,
    page: number,
    sort: ProductSort,
    attr: string[] = [],
  ) {
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

  /**
   * The products a product is sold together with (FR-SET-05). Only ever asked
   * from the browser, when the marker is pressed, so it does not defer: there
   * is no server render of a panel nobody has opened yet.
   *
   * `null` where the product is gone — the marker was drawn from a page that
   * has since gone stale, which is nothing to interrupt anyone about.
   */
  async getProductPairings(slug: string) {
    const result = await safe(
      this.client.getProductPairings({ params: { slug } }),
    );
    if (result.isDefined) return null;
    if (!result.isSuccess) throw result.error;
    return result.data.items;
  }

  /** The main page's row (FR-CAT-09), drawn afresh by every call. */
  async getFeaturedProducts() {
    return (await this.client.getFeaturedProducts()).items;
  }

  /** A single product (FR-CAT-05). `null` when it does not exist. */
  async getProduct(slug: string) {
    const result = await safe(this.client.getProduct({ params: { slug } }));
    if (result.isDefined) return null;
    if (!result.isSuccess) throw result.error;
    return result.data;
  }
}
