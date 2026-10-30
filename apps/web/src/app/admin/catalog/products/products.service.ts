import { inject, Injectable } from '@angular/core';
import {
  ProductAvailability,
  HiddenProduct,
  ProductPage,
} from '@b2b-catalog-platform/shared/core/catalog';
import {
  AdminProduct,
  AdminProductSort,
  AdminProductState,
  ProductErrorCode,
  ProductFeature,
  ProductGapFilter,
  ProductInput,
} from '@b2b-catalog-platform/shared/admin/catalog';
import { adminProductsContract } from '../../contract-routes.generated';
import { safe, type ClientPromiseResult } from '@orpc/client';
import { createOrpcClient } from '../../../shared/core/orpc-client';
import { renderable } from '../../../shared/core/renderable';
import { WorkService } from '../../../shared/work/work.service';
import type { EditModeCatalog } from '../../../core/catalog/edit-mode-catalog';

/**
 * The admin product client. The declared refusals come back as typed results
 * the screen can render; only the unexpected throws.
 */
@Injectable({ providedIn: 'root' })
export class ProductsService implements EditModeCatalog {
  private client = createOrpcClient(adminProductsContract);
  private readonly work = inject(WorkService);

  /** Every part of the query is optional: an omitted one means the
   * contract's default. */
  list(query: ProductGridQuery = {}) {
    return this.client.listProducts({ query });
  }

  /** `null` when the product does not exist. */
  async get(slug: string): Promise<AdminProduct | null> {
    const result = await safe(this.client.getProduct({ params: { slug } }));
    if (result.isDefined && result.error.code === 'product-not-found') {
      return null;
    }
    if (!result.isSuccess) throw result.error;
    return result.data;
  }

  create(body: ProductInput): Promise<ProductSaveResult> {
    return this.saved(this.client.createProduct({ body }));
  }

  update(slug: string, body: ProductInput): Promise<ProductSaveResult> {
    return this.saved(this.client.updateProduct({ params: { slug }, body }));
  }

  /** The stored row, or the code the server refused with. */
  private async saved<TError extends Error>(
    call: ClientPromiseResult<AdminProduct, TError>,
  ): Promise<ProductSaveResult> {
    const result = await safe(call);
    if (result.isDefined && renderable(result.error.code)) {
      return { ok: false, code: result.error.code };
    }
    if (!result.isSuccess) throw result.error;
    return { ok: true, product: result.data };
  }

  remove(slug: string): Promise<AdminProduct> {
    return this.afterWork(this.client.deleteProduct({ params: { slug } }));
  }

  restore(slug: string): Promise<AdminProduct> {
    return this.afterWork(this.client.restoreProduct({ params: { slug } }));
  }

  /** Deletes a deleted product for good (FR-ADM-21). */
  async purge(
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

  setPublished(slug: string, published: boolean): Promise<AdminProduct> {
    return this.afterWork(
      this.client.setProductPublished({
        params: { slug },
        body: { published },
      }),
    );
  }

  /**
   * The screens that publish, delete and restore do not navigate afterwards,
   * so without a refresh the navbar's work dot would keep counting what was
   * just done (FR-ADM-06).
   */
  private async afterWork<T>(call: Promise<T>): Promise<T> {
    const result = await call;
    void this.work.refresh();
    return result;
  }

  /** Any product as its page shows it, with why the storefront does not
   * (FR-ADM-06). `null` when there is no such product at all. */
  async getPage(slug: string): Promise<ProductPage | null> {
    const result = await safe(this.client.getProductPage({ params: { slug } }));
    if (result.isDefined && result.error.code === 'product-not-found') {
      return null;
    }
    if (!result.isSuccess) throw result.error;
    return result.data;
  }

  /** The unpublished products in a category subtree, for edit mode. */
  async listHidden(categorySlug: string): Promise<HiddenProduct[]> {
    const result = await safe(
      this.client.listHiddenProducts({ params: { slug: categorySlug } }),
    );
    if (result.isDefined) return [];
    if (!result.isSuccess) throw result.error;
    return result.data.items;
  }

  /**
   * The unpublish confirmation, wherever a product is taken off sale: the
   * question, and the live counterparts it would strand (FR-SET-04).
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

  /** Empty when the question cannot be answered: a missing line in a
   * confirmation must not stand between an admin and unpublishing. */
  private async strandedPairingNames(slug: string): Promise<string[]> {
    const result = await safe(
      this.client.listStrandedPairings({ params: { slug } }),
    );
    if (!result.isSuccess) return [];
    return result.data.items.map((item) => item.name);
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

/** A product refusal, including the ownership one (FR-ADM-10). */
export type ProductSaveErrorCode =
  ProductErrorCode | 'catalog-externally-owned';

export type ProductSaveResult =
  | { ok: true; product: AdminProduct }
  | { ok: false; code: ProductSaveErrorCode };
