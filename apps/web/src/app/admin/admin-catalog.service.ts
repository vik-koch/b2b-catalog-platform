import { Injectable } from '@angular/core';
import {
  adminCatalogContract,
  AdminProduct,
  CategoryInput,
  ProductInput,
  ProductListItem,
  ReorderCategoriesRequest,
} from '@b2b-catalog-platform/shared';
import { createApiClient } from '../core/api-client';

/**
 * The admin catalog write client — the counterpart to the public
 * `CatalogService`. Thin wrappers over the ts-rest contract that surface the
 * declared error statuses (404/409) as typed results the editor can act on,
 * and throw only on the unexpected.
 */
@Injectable({ providedIn: 'root' })
export class AdminCatalogService {
  private client = createApiClient(adminCatalogContract);

  // --- Products ---------------------------------------------------------

  async listProducts(query: { page?: number; categoryId?: string } = {}) {
    const response = await this.client.listProducts({ query });
    if (response.status === 200) return response.body;
    throw new Error(`Failed to list products (status ${response.status})`);
  }

  /** `null` when the product does not exist. */
  async getProduct(slug: string): Promise<AdminProduct | null> {
    const response = await this.client.getProduct({ params: { slug } });
    if (response.status === 200) return response.body;
    if (response.status === 404) return null;
    throw new Error(`Failed to load product "${slug}" (${response.status})`);
  }

  /**
   * Creates a product. Returns the stored product, or a typed conflict/blocked
   * result the editor can render inline (duplicate slug/sourceId → 409; unknown
   * category → 404) rather than a thrown error.
   */
  async createProduct(body: ProductInput): Promise<SaveResult> {
    const response = await this.client.createProduct({ body });
    if (response.status === 201) return { ok: true, product: response.body };
    if (response.status === 409 || response.status === 404) {
      return { ok: false, message: response.body.message };
    }
    throw new Error(`Failed to create product (status ${response.status})`);
  }

  async updateProduct(slug: string, body: ProductInput): Promise<SaveResult> {
    const response = await this.client.updateProduct({
      params: { slug },
      body,
    });
    if (response.status === 200) return { ok: true, product: response.body };
    if (response.status === 409 || response.status === 404) {
      return { ok: false, message: response.body.message };
    }
    throw new Error(`Failed to save product "${slug}" (${response.status})`);
  }

  async deleteProduct(slug: string): Promise<AdminProduct> {
    const response = await this.client.deleteProduct({
      params: { slug },
      body: undefined,
    });
    if (response.status === 200) return response.body;
    throw new Error(`Failed to delete product "${slug}" (${response.status})`);
  }

  /** The soft-deleted products in a category subtree — the edit-mode overlay. */
  async listDeletedProducts(slug: string): Promise<ProductListItem[]> {
    const response = await this.client.listDeletedProducts({
      params: { slug },
    });
    if (response.status === 200) return response.body.items;
    if (response.status === 404) return [];
    throw new Error(
      `Failed to list deleted products for "${slug}" (${response.status})`,
    );
  }

  async restoreProduct(slug: string): Promise<AdminProduct> {
    const response = await this.client.restoreProduct({
      params: { slug },
      body: {},
    });
    if (response.status === 200) return response.body;
    throw new Error(`Failed to restore product "${slug}" (${response.status})`);
  }

  // --- Categories -------------------------------------------------------

  async listCategories() {
    const response = await this.client.listCategories();
    if (response.status === 200) return response.body.categories;
    throw new Error(`Failed to list categories (status ${response.status})`);
  }

  async createCategory(body: CategoryInput) {
    const response = await this.client.createCategory({ body });
    if (response.status === 201) return response.body;
    throw new Error(`Failed to create category (status ${response.status})`);
  }

  async updateCategory(id: string, body: CategoryInput) {
    const response = await this.client.updateCategory({ params: { id }, body });
    if (response.status === 200) return response.body;
    throw new Error(`Failed to update category "${id}" (${response.status})`);
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
    const response = await this.client.deleteCategory({
      params: { id },
      query: reassignTo ? { reassignTo } : {},
      body: undefined,
    });
    if (response.status === 200) return { ok: true };
    if (response.status === 409 || response.status === 404) {
      return { ok: false, message: response.body.message };
    }
    throw new Error(`Failed to delete category "${id}" (${response.status})`);
  }

  async reorderCategories(body: ReorderCategoriesRequest) {
    const response = await this.client.reorderCategories({ body });
    if (response.status === 200) return response.body.categories;
    throw new Error(`Failed to reorder categories (status ${response.status})`);
  }
}

/** A create/update outcome: the stored product, or a message to show inline. */
export type SaveResult =
  | { ok: true; product: AdminProduct }
  | { ok: false; message: string };

/** A category delete outcome: done, or blocked with a message to show. */
export type CategoryDeleteResult =
  | { ok: true }
  | { ok: false; message: string };
