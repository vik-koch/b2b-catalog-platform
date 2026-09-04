import { inject, Injectable } from '@angular/core';
import {
  AdminProduct,
  CatalogErrorCode,
  AdminProductSort,
  AdminProductState,
  CategoryInput,
  ProductAvailability,
  ProductInput,
  HiddenProduct,
  ReorderCategoriesRequest,
} from '@b2b-catalog-platform/shared';
import { adminCatalogContract } from '../core/contract-routes.generated';
import { safe, type ClientPromiseResult } from '@orpc/client';
import { createOrpcClient } from '../core/orpc-client';
import { WorkService } from '../work/work.service';

/**
 * The refusals the editor can render. Every route also declares the two auth
 * ones, and those mean the session is wrong rather than the edit — not this
 * screen's to phrase, so they throw like anything unexpected.
 */
function renderable(code: string): code is CatalogErrorCode {
  return code !== 'not-authenticated' && code !== 'insufficient-role';
}

/**
 * The admin catalog write client — the counterpart to the public
 * `CatalogService`. Thin wrappers over the contract that surface the declared
 * refusals as typed results the editor can act on, and throw only on the
 * unexpected.
 */
@Injectable({ providedIn: 'root' })
export class AdminCatalogService {
  private client = createOrpcClient(adminCatalogContract);
  private readonly work = inject(WorkService);

  /** The stored row, or the code the server refused with. */
  private async saved<TError extends Error>(
    call: ClientPromiseResult<AdminProduct, TError>,
  ): Promise<SaveResult> {
    const result = await safe(call);
    if (result.isDefined && renderable(result.error.code)) {
      return { ok: false, code: result.error.code };
    }
    if (!result.isSuccess) throw result.error;
    return { ok: true, product: result.data };
  }

  // --- Products ---------------------------------------------------------

  /** The grid's filter/search/sort surface (FR-ADM-05). Every part is optional:
   * an omitted parameter and the contract's default mean the same thing. */
  listProducts(query: ProductGridQuery = {}) {
    return this.client.listProducts({ query });
  }

  /** `null` when the product does not exist. */
  async getProduct(slug: string): Promise<AdminProduct | null> {
    const result = await safe(this.client.getProduct({ params: { slug } }));
    if (result.isDefined && result.error.code === 'product-not-found') {
      return null;
    }
    if (!result.isSuccess) throw result.error;
    return result.data;
  }

  /**
   * Creates a product. Returns the stored product, or a typed conflict/blocked
   * result the editor can render inline (duplicate slug/sourceId → 409; unknown
   * category → 404) rather than a thrown error.
   */
  createProduct(body: ProductInput): Promise<SaveResult> {
    return this.saved(this.client.createProduct({ body }));
  }

  updateProduct(slug: string, body: ProductInput): Promise<SaveResult> {
    return this.saved(this.client.updateProduct({ params: { slug }, body }));
  }

  deleteProduct(slug: string): Promise<AdminProduct> {
    return this.afterWork(this.client.deleteProduct({ params: { slug } }));
  }

  /** The soft-deleted products in a category subtree — the edit-mode overlay. */
  async listHiddenProducts(slug: string): Promise<HiddenProduct[]> {
    const result = await safe(
      this.client.listHiddenProducts({ params: { slug } }),
    );
    if (result.isDefined) return [];
    if (!result.isSuccess) throw result.error;
    return result.data.items;
  }

  restoreProduct(slug: string): Promise<AdminProduct> {
    return this.afterWork(this.client.restoreProduct({ params: { slug } }));
  }

  setProductPublished(slug: string, published: boolean): Promise<AdminProduct> {
    return this.afterWork(
      this.client.setProductPublished({
        params: { slug },
        body: { published },
      }),
    );
  }

  /**
   * Wraps a call that changes the review queue (FR-ADM-06) the work marker
   * counts. Publishing, deleting and restoring all happen on screens that do
   * not navigate afterwards, so without this the dot in the navbar would keep
   * claiming work that has just been finished until the next click.
   */
  private async afterWork<T>(call: Promise<T>): Promise<T> {
    const result = await call;
    void this.work.refresh();
    return result;
  }

  // --- Categories -------------------------------------------------------

  async listCategories() {
    return (await this.client.listCategories()).categories;
  }

  createCategory(body: CategoryInput) {
    return this.client.createCategory({ body });
  }

  updateCategory(id: string, body: CategoryInput) {
    return this.client.updateCategory({ params: { id }, body });
  }

  /**
   * Deletes a category. Pass `reassignTo` to move its products (including
   * soft-deleted ones) to that category first — the way to delete a populated
   * one. Returns a typed blocked result (409: subcategories, or products with no
   * `reassignTo`; 404: reassign target gone) rather than throwing.
   */
  async deleteCategory(
    id: string,
    reassignTo?: string,
  ): Promise<CategoryDeleteResult> {
    const result = await safe(
      this.client.deleteCategory({
        params: { id },
        query: reassignTo ? { reassignTo } : {},
      }),
    );
    if (result.isDefined && renderable(result.error.code)) {
      return { ok: false, code: result.error.code };
    }
    if (!result.isSuccess) throw result.error;
    return { ok: true };
  }

  async reorderCategories(body: ReorderCategoriesRequest) {
    return (await this.client.reorderCategories({ body })).categories;
  }
}

/** What the admin grid may ask for (FR-ADM-05). */
export interface ProductGridQuery {
  page?: number;
  categoryId?: string;
  state?: AdminProductState;
  /** One of the three stock states (FR-STOCK-02); absent is any. */
  availability?: ProductAvailability;
  q?: string;
  sort?: AdminProductSort;
  /** The inventory's drill-down; the value only narrows an already-given key. */
  attributeKey?: string;
  attributeValue?: string;
  /** The tier list's drill-down: products priced for one tier. */
  tierId?: string;
}

/**
 * A create/update outcome: the stored product, or the code the server refused
 * with. The editor looks the wording up in the admin text — nothing the server
 * wrote is shown.
 */
export type SaveResult =
  { ok: true; product: AdminProduct } | { ok: false; code: CatalogErrorCode };

/** A category delete outcome: done, or blocked with a code to explain. */
export type CategoryDeleteResult =
  { ok: true } | { ok: false; code: CatalogErrorCode };
