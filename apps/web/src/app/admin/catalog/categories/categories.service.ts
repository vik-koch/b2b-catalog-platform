import { Injectable } from '@angular/core';
import {
  AdminCategory,
  CategoryErrorCode,
  CategoryInput,
  ReorderCategoriesRequest,
} from '@b2b-catalog-platform/shared/admin/catalog';
import { adminCategoriesContract } from '../../contract-routes.generated';
import { safe, type ClientPromiseResult } from '@orpc/client';
import { createOrpcClient } from '../../../shared/core/orpc-client';
import { renderable } from '../../../shared/core/renderable';

/**
 * The admin category client. The declared refusals come back as typed results
 * the screen can render; only the unexpected throws.
 */
@Injectable({ providedIn: 'root' })
export class CategoriesService {
  private client = createOrpcClient(adminCategoriesContract);

  async list(): Promise<AdminCategory[]> {
    return (await this.client.listCategories()).categories;
  }

  /** A collision on either unique column comes back as a code: an admin
   * typing in the source system's key ahead of a run is the case that hits it. */
  create(body: CategoryInput): Promise<CategorySaveResult> {
    return this.saved(this.client.createCategory({ body }));
  }

  update(id: string, body: CategoryInput): Promise<CategorySaveResult> {
    return this.saved(this.client.updateCategory({ params: { id }, body }));
  }

  /** The stored row, or the code the server refused with. */
  private async saved<TError extends Error>(
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
   * A populated category is deleted by passing `reassignTo`: its products,
   * soft-deleted ones included, move there first. Subcategories, products
   * without a target, or a target gone come back as a code.
   */
  async remove(id: string, reassignTo?: string): Promise<CategoryDeleteResult> {
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

  async reorder(body: ReorderCategoriesRequest): Promise<AdminCategory[]> {
    return (await this.client.reorderCategories({ body })).categories;
  }
}

/** A category refusal, including the ownership one (FR-ADM-10). */
export type CategorySaveErrorCode =
  CategoryErrorCode | 'catalog-externally-owned';

export type CategorySaveResult =
  | { ok: true; category: AdminCategory }
  | { ok: false; code: CategorySaveErrorCode };

export type CategoryDeleteResult =
  { ok: true } | { ok: false; code: CategorySaveErrorCode };
