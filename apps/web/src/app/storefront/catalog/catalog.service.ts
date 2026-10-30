import { Injectable } from '@angular/core';
import { CatalogSort } from '@b2b-catalog-platform/shared/storefront/catalog';
import { catalogContract } from '../contract-routes.generated';
import { safe } from '@orpc/client';
import { createOrpcClient } from '../../shared/core/orpc-client';

@Injectable({ providedIn: 'root' })
export class CatalogService {
  private client = createOrpcClient(catalogContract);

  /** The full category tree for the main-page overview (FR-CAT-01/02). */
  async getCategoryTree() {
    return (await this.client.getCategoryTree()).categories;
  }

  /** A page of every product in the catalogue (FR-CAT-02/03), with the
   * top-level categories as its drill-down nav. */
  async getCatalogProducts(
    page: number,
    sort: CatalogSort,
    attr: string[] = [],
  ) {
    return this.client.getCatalogProducts({ query: { page, sort, attr } });
  }

  /** A page of products in a category (FR-CAT-03/04). `null` when the category
   * does not exist, so the caller can render a not-found rather than throw. */
  async getCategoryProducts(
    slug: string,
    page: number,
    sort: CatalogSort,
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
