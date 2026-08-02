import { Injectable } from '@angular/core';
import {
  catalogContract,
  SearchSuggestion,
} from '@b2b-catalog-platform/shared';
import { createApiClient } from '../core/api-client';

@Injectable({ providedIn: 'root' })
export class CatalogService {
  private client = createApiClient(catalogContract);

  /** The full category tree for the main-page overview (FR-CAT-01/02). */
  async getCategoryTree() {
    const response = await this.client.getCategoryTree();
    if (response.status === 200) {
      return response.body.categories;
    }
    throw new Error(`Failed to load categories (status ${response.status})`);
  }

  /** A page of products in a category (FR-CAT-03/04). `null` when the category
   * does not exist, so the caller can render a not-found rather than throw. */
  async getCategoryProducts(slug: string, page: number) {
    const response = await this.client.getCategoryProducts({
      params: { slug },
      query: { page },
    });
    if (response.status === 200) {
      return response.body;
    }
    if (response.status === 404) {
      return null;
    }
    throw new Error(
      `Failed to load products for "${slug}" (status ${response.status})`,
    );
  }

  /** A page of search results, best match first (FR-SEARCH-01…03). An
   * unsearchable query is an empty page, not an error — see the contract. */
  async searchProducts(q: string, page: number) {
    const response = await this.client.searchProducts({ query: { q, page } });
    if (response.status === 200) {
      return response.body;
    }
    throw new Error(`Search failed (status ${response.status})`);
  }

  /**
   * Type-ahead suggestions for the search bar (FR-SEARCH-05). Failures are
   * answered with an empty list rather than thrown: suggestions are an
   * accelerator, and a dropdown that cannot load is a reason to show nothing,
   * not to interrupt someone mid-query.
   */
  async getSearchSuggestions(q: string): Promise<SearchSuggestion[]> {
    const response = await this.client.getSearchSuggestions({ query: { q } });
    return response.status === 200 ? response.body.items : [];
  }

  /** A single product (FR-CAT-05). `null` when it does not exist. */
  async getProduct(slug: string) {
    const response = await this.client.getProduct({ params: { slug } });
    if (response.status === 200) {
      return response.body;
    }
    if (response.status === 404) {
      return null;
    }
    throw new Error(
      `Failed to load product "${slug}" (status ${response.status})`,
    );
  }
}
