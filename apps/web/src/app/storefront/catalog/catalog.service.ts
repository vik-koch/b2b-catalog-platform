import { Injectable } from '@angular/core';
import { ClientPromiseResult, safe } from '@orpc/client';
import { CatalogSort } from '@b2b-catalog-platform/shared/storefront/catalog';
import { createOrpcClient } from '../../shared/core/orpc-client';
import { catalogContract } from '../contract-routes.generated';

@Injectable({ providedIn: 'root' })
export class CatalogService {
  private readonly client = createOrpcClient(catalogContract);

  /** The whole tree, for the overview (FR-CAT-01/02). */
  async getCategoryTree() {
    return (await this.client.getCategoryTree()).categories;
  }

  /** Every product (FR-CAT-02/03), with the top-level categories as its
   * drill-down nav. */
  getCatalogProducts(page: number, sort: CatalogSort, attr: string[] = []) {
    return this.client.getCatalogProducts({ query: { page, sort, attr } });
  }

  /** `null` when the category does not exist (FR-CAT-03/04). */
  getCategoryProducts(
    slug: string,
    page: number,
    sort: CatalogSort,
    attr: string[] = [],
  ) {
    return nullIfNotFound(
      this.client.getCategoryProducts({
        params: { slug },
        query: { page, sort, attr },
      }),
    );
  }

  /** What a product is sold together with (FR-SET-05). `null` when it is gone:
   * the marker was drawn from a page that has since gone stale. */
  async getProductPairings(slug: string) {
    const result = await nullIfNotFound(
      this.client.getProductPairings({ params: { slug } }),
    );
    return result && result.items;
  }

  /** The main page's row (FR-CAT-09), drawn afresh by every call. */
  async getFeaturedProducts() {
    return (await this.client.getFeaturedProducts()).items;
  }

  /** `null` when the product does not exist (FR-CAT-05). */
  getProduct(slug: string) {
    return nullIfNotFound(this.client.getProduct({ params: { slug } }));
  }
}

/** The route's one defined error is its not-found; anything else throws. */
async function nullIfNotFound<T, E>(
  call: ClientPromiseResult<T, E>,
): Promise<T | null> {
  const result = await safe(call);
  if (result.isDefined) return null;
  if (!result.isSuccess) throw result.error;
  return result.data;
}
