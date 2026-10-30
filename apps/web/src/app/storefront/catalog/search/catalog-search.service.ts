import { Injectable } from '@angular/core';
import { safe } from '@orpc/client';
import {
  ProductListItem,
  SearchSort,
} from '@b2b-catalog-platform/shared/core/catalog';
import { SearchCategory } from '@b2b-catalog-platform/shared/storefront/catalog';
import { createOrpcClient } from '../../../shared/core/orpc-client';
import { catalogContract } from '../../contract-routes.generated';

@Injectable({ providedIn: 'root' })
export class CatalogSearchService {
  private readonly client = createOrpcClient(catalogContract);

  /** Best match first (FR-SEARCH-01…03). An unsearchable query answers with an
   * empty page, not an error. */
  async searchProducts(
    q: string,
    page: number,
    sort: SearchSort,
    attr: string[] = [],
  ) {
    return this.client.searchProducts({ query: { q, page, sort, attr } });
  }

  /** Type-ahead for the search bar (FR-SEARCH-05/06/07). A failure answers with
   * nothing: suggestions only speed a query up, so they never interrupt it. */
  async getSearchSuggestions(
    q: string,
  ): Promise<{ items: ProductListItem[]; categories: SearchCategory[] }> {
    const { error, data } = await safe(
      this.client.getSearchSuggestions({ query: { q } }),
    );
    return error ? { items: [], categories: [] } : data;
  }
}
