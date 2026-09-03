import { Injectable } from '@angular/core';
import {
  AttributeDefinition,
  AttributeDefinitionInput,
  AttributeErrorCode,
  AttributeKeyUsage,
  AttributeValueUsage,
  CategoryFilters,
  SaveCategoryFiltersRequest,
  RenameAttributeKeyRequest,
  RenameAttributeValueRequest,
  ReorderAttributesRequest,
} from '@b2b-catalog-platform/shared';
import { attributesContract } from '../../core/contract-routes.generated';
import { safe, type ClientPromiseResult } from '@orpc/client';
import { createOrpcClient } from '../../core/orpc-client';

/**
 * A save the server refused, as its own code. The list looks the wording up in
 * the admin text, so nothing the server wrote reaches the screen.
 */
export type AttributeResult =
  | { ok: true; definition: AttributeDefinition }
  | { ok: false; code: AttributeErrorCode };

/**
 * Every route also declares the two auth refusals; those mean the session is
 * wrong rather than the edit, and reach a redirect instead of this screen.
 */
function renderable(code: string): code is AttributeErrorCode {
  return code !== 'not-authenticated' && code !== 'insufficient-role';
}

/**
 * The filterable-attribute registry client. Same discipline as
 * `TiersService`: the declared refusals (409 duplicate name or slug, 404 gone)
 * come back as typed results, and only the unexpected throws.
 */
@Injectable({ providedIn: 'root' })
export class AttributesService {
  private client = createOrpcClient(attributesContract);

  /** A saved definition, or the code the server refused it with. */
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

  /** A category's panel, or null when the category (or an attribute) is gone. */
  private async panel<TError extends Error>(
    call: ClientPromiseResult<CategoryFilters, TError>,
  ): Promise<CategoryFilters | null> {
    const result = await safe(call);
    if (result.isDefined && renderable(result.error.code)) return null;
    if (!result.isSuccess) throw result.error;
    return result.data;
  }

  async list(): Promise<AttributeDefinition[]> {
    return (await this.client.listAttributes()).definitions;
  }

  create(body: AttributeDefinitionInput): Promise<AttributeResult> {
    return this.saved(this.client.createAttribute({ body }));
  }

  update(id: string, body: AttributeDefinitionInput): Promise<AttributeResult> {
    return this.saved(this.client.updateAttribute({ params: { id }, body }));
  }

  /** Commits a whole filter-panel order; returns the list as stored. */
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

  /** Rewrites a key on every product carrying it; returns how many rows moved. */
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

  /**
   * Deleting a definition only stops the attribute being filterable — no
   * product data hangs off it — so the only refusal here is "already gone".
   */
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
