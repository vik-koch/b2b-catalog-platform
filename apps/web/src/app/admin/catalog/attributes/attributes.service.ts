import { Injectable } from '@angular/core';
import {
  AttributeDefinition,
  AttributeDefinitionInput,
  AttributeErrorCode,
  AttributeKeyUsage,
  AttributeValueUsage,
  CatalogFilters,
  CategoryFilters,
  SaveCategoryFiltersRequest,
  RenameAttributeKeyRequest,
  RenameAttributeValueRequest,
  ReorderAttributesRequest,
} from '@b2b-catalog-platform/shared/admin/catalog';
import { attributesContract } from '../../contract-routes.generated';
import { safe, type ClientPromiseResult } from '@orpc/client';
import { createOrpcClient } from '../../../shared/core/orpc-client';
import { renderable } from '../../../shared/core/renderable';

export type AttributeResult =
  | { ok: true; definition: AttributeDefinition }
  | { ok: false; code: AttributeErrorCode };

/**
 * The filterable-attribute client. The declared refusals come back as typed
 * results; only the unexpected throws.
 */
@Injectable({ providedIn: 'root' })
export class AttributesService {
  private client = createOrpcClient(attributesContract);

  async list(): Promise<AttributeDefinition[]> {
    return (await this.client.listAttributes()).definitions;
  }

  create(body: AttributeDefinitionInput): Promise<AttributeResult> {
    return this.saved(this.client.createAttribute({ body }));
  }

  update(id: string, body: AttributeDefinitionInput): Promise<AttributeResult> {
    return this.saved(this.client.updateAttribute({ params: { id }, body }));
  }

  /** The stored row, or the code the server refused with. */
  private async saved<TError extends Error>(
    call: ClientPromiseResult<AttributeDefinition, TError>,
  ): Promise<AttributeResult> {
    const result = await safe(call);
    if (result.isDefined && renderable(result.error.code)) {
      return { ok: false, code: result.error.code };
    }
    if (!result.isSuccess) throw result.error;
    return { ok: true, definition: result.data };
  }

  async reorder(
    body: ReorderAttributesRequest,
  ): Promise<AttributeDefinition[]> {
    return (await this.client.reorderAttributes({ body })).definitions;
  }

  /** Every attribute key in use across the catalog, declared or freetext. */
  async listKeys(): Promise<AttributeKeyUsage[]> {
    return (await this.client.listAttributeKeys()).keys;
  }

  /** The values in use under one key, numbers first and in numeric order. */
  async listValues(key: string): Promise<AttributeValueUsage[]> {
    return (await this.client.listAttributeValues({ query: { key } })).values;
  }

  /** Rewrites a key on every product carrying it; answers how many changed. */
  async renameKey(body: RenameAttributeKeyRequest): Promise<number> {
    return (await this.client.renameAttributeKey({ body })).updated;
  }

  async renameValue(body: RenameAttributeValueRequest): Promise<number> {
    return (await this.client.renameAttributeValue({ body })).updated;
  }

  /** One category's filter panel, resolved (FR-ATTR-11). */
  async categoryFilters(slug: string): Promise<CategoryFilters | null> {
    return this.panel(this.client.getCategoryFilters({ params: { slug } }));
  }

  /** Replaces the panel wholesale; returns it as stored. */
  async saveCategoryFilters(
    slug: string,
    body: SaveCategoryFiltersRequest,
  ): Promise<CategoryFilters | null> {
    return this.panel(
      this.client.saveCategoryFilters({ params: { slug }, body }),
    );
  }

  /** Drops the overlay, so the category inherits again. */
  async resetCategoryFilters(slug: string): Promise<CategoryFilters | null> {
    return this.panel(this.client.resetCategoryFilters({ params: { slug } }));
  }

  /** `null` when the category or one of the attributes is gone. */
  private async panel<TError extends Error>(
    call: ClientPromiseResult<CategoryFilters, TError>,
  ): Promise<CategoryFilters | null> {
    const result = await safe(call);
    if (result.isDefined && renderable(result.error.code)) return null;
    if (!result.isSuccess) throw result.error;
    return result.data;
  }

  /** The whole-catalogue listing's panel (FR-ATTR-12). */
  async catalogFilters(): Promise<CatalogFilters> {
    return this.client.getCatalogFilters();
  }

  /** Replaces the whole-catalogue panel; null when an attribute is gone. */
  async saveCatalogFilters(
    body: SaveCategoryFiltersRequest,
  ): Promise<CatalogFilters | null> {
    const result = await safe(this.client.saveCatalogFilters({ body }));
    if (result.isDefined && renderable(result.error.code)) return null;
    if (!result.isSuccess) throw result.error;
    return result.data;
  }

  /** No product data hangs off a definition, so the one refusal is that it
   * is already gone. */

  async remove(
    id: string,
  ): Promise<{ ok: true } | { ok: false; code: AttributeErrorCode }> {
    const result = await safe(this.client.deleteAttribute({ params: { id } }));
    if (result.isDefined && renderable(result.error.code)) {
      return { ok: false, code: result.error.code };
    }
    if (!result.isSuccess) throw result.error;
    return { ok: true };
  }
}
