import { inject, Injectable } from '@angular/core';
import {
  ProductAvailability,
  HiddenProduct,
  ProductPage,
} from '@b2b-catalog-platform/shared/core/catalog';
import {
  AdminCategory,
  AdminProduct,
  AdminProductSort,
  AdminProductState,
  CategoryErrorCode,
  CategoryInput,
  ProductErrorCode,
  ProductFeature,
  ProductGapFilter,
  ProductInput,
  ReorderCategoriesRequest,
} from '@b2b-catalog-platform/shared/admin/catalog';
import {
  adminCategoriesContract,
  adminProductsContract,
} from '../contract-routes.generated';
import { safe, type ClientPromiseResult } from '@orpc/client';
import { createOrpcClient } from '../../shared/core/orpc-client';
import { WorkService } from '../../shared/work/work.service';
import type { EditModeCatalog } from '../../core/catalog/edit-mode-catalog';

/**
 * The refusals a screen can render: every code a route declares but the two
 * auth ones, which mean the session is wrong rather than the edit and throw
 * like anything unexpected.
 */
function renderable<T extends string>(
  code: T,
): code is Exclude<T, 'not-authenticated' | 'insufficient-role'> {
  return code !== 'not-authenticated' && code !== 'insufficient-role';
}

/**
 * The admin catalog write client — the counterpart to the public
 * `CatalogService`. Thin wrappers over the contract that surface the declared
 * refusals as typed results the editor can act on, and throw only on the
 * unexpected.
 */
@Injectable({ providedIn: 'root' })
export class AdminCatalogService implements EditModeCatalog {
  // One client over both routers until products and categories each get a
  // service of their own.
  private client = createOrpcClient({
    ...adminProductsContract,
    ...adminCategoriesContract,
  });
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

  /** Any product as its page shows it, and why the storefront does not
   * (FR-ADM-06). `null` when there is no such product at all. */
  async getProductPage(slug: string): Promise<ProductPage | null> {
    const result = await safe(this.client.getProductPage({ params: { slug } }));
    if (result.isDefined && result.error.code === 'product-not-found') {
      return null;
    }
    if (!result.isSuccess) throw result.error;
    return result.data;
  }

  /**
   * Deletes a deleted product permanently (FR-ADM-21). A refusal comes back as
   * its code — on an order, owned by the source — for the list to explain.
   */
  async purgeProduct(
    slug: string,
  ): Promise<{ ok: true } | { ok: false; code: ProductSaveErrorCode }> {
    const result = await safe(this.client.purgeProduct({ params: { slug } }));
    void this.work.refresh();
    if (result.isDefined && renderable(result.error.code)) {
      return { ok: false, code: result.error.code };
    }
    if (!result.isSuccess) throw result.error;
    return { ok: true };
  }

  /** The unpublished products in a category subtree: the edit-mode overlay. */
  async listHiddenProducts(slug: string): Promise<HiddenProduct[]> {
    const result = await safe(
      this.client.listHiddenProducts({ params: { slug } }),
    );
    if (result.isDefined) return [];
    if (!result.isSuccess) throw result.error;
    return result.data.items;
  }

  /**
   * The names of the live products unpublishing this one would leave on sale
   * with no counterpart (FR-SET-04). Empty when the question cannot be
   * answered: it adds a line to a confirmation, and must not be what stands
   * between an admin and unpublishing.
   */
  async strandedPairingNames(slug: string): Promise<string[]> {
    const result = await safe(
      this.client.listStrandedPairings({ params: { slug } }),
    );
    if (!result.isSuccess) return [];
    return result.data.items.map((item) => item.name);
  }

  /**
   * What the unpublish confirmation says, wherever a product is taken off
   * sale: the question, and the stranded counterparts when there are any.
   */
  async unpublishMessage(
    product: { slug: string; name: string },
    text: {
      unpublishConfirm: { message: string };
      unpublishStranded: string;
    },
  ): Promise<string> {
    const message = text.unpublishConfirm.message.replace(
      '{name}',
      product.name,
    );
    const stranded = await this.strandedPairingNames(product.slug);
    return stranded.length === 0
      ? message
      : `${message} ${text.unpublishStranded.replace('{names}', stranded.join(', '))}`;
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

  /**
   * Creates a category. Like a product save, a collision on either unique
   * column comes back as a code the editor renders rather than as a throw —
   * an admin pre-assigning the source system's key to a category typed here is
   * the case that hits it.
   */
  createCategory(body: CategoryInput): Promise<CategorySaveResult> {
    return this.savedCategory(this.client.createCategory({ body }));
  }

  updateCategory(id: string, body: CategoryInput): Promise<CategorySaveResult> {
    return this.savedCategory(
      this.client.updateCategory({ params: { id }, body }),
    );
  }

  /** The stored row, or the code the server refused with. */
  private async savedCategory<TError extends Error>(
    call: ClientPromiseResult<AdminCategory, TError>,
  ): Promise<CategorySaveResult> {
    const result = await safe(call);
    if (result.isDefined && renderable(result.error.code)) {
      return { ok: false, code: result.error.code };
    }
    if (!result.isSuccess) throw result.error;
    return { ok: true, category: result.data };
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
  /** `direct` leaves out the category's subcategories (FR-ADM-19). */
  categoryScope?: 'subtree' | 'direct';
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
  tierPriced?: 'yes' | 'no';
  documentId?: string;
  /** What the product's own content lacks or carries (FR-ADM-20). */
  missing?: ProductGapFilter[];
  has?: ProductFeature[];
}

/** A product refusal, including the ownership one (FR-ADM-10). The editor
 * looks the wording up in the admin text; nothing the server wrote is shown. */
export type ProductSaveErrorCode =
  ProductErrorCode | 'catalog-externally-owned';

/** A create/update outcome: the stored product, or the refusal. */
export type SaveResult =
  | { ok: true; product: AdminProduct }
  | { ok: false; code: ProductSaveErrorCode };

/** A category refusal, including the ownership one (FR-ADM-10). */
export type CategorySaveErrorCode =
  CategoryErrorCode | 'catalog-externally-owned';

export type CategorySaveResult =
  | { ok: true; category: AdminCategory }
  | { ok: false; code: CategorySaveErrorCode };

/** A category delete outcome: done, or blocked with a code to explain. */
export type CategoryDeleteResult =
  { ok: true } | { ok: false; code: CategorySaveErrorCode };
