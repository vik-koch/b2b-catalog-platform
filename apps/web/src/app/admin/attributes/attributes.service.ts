import { Injectable } from '@angular/core';
import {
  AttributeDefinition,
  AttributeDefinitionInput,
  AttributeErrorCode,
  AttributeKeyUsage,
  attributesContract,
  AttributeValueUsage,
  CategoryFilters,
  SaveCategoryFiltersRequest,
  RenameAttributeKeyRequest,
  RenameAttributeValueRequest,
  ReorderAttributesRequest,
} from '@b2b-catalog-platform/shared';
import { createApiClient } from '../../core/api-client';

/**
 * A save the server refused, as its own code. The list looks the wording up in
 * the admin text, so nothing the server wrote reaches the screen.
 */
export type AttributeResult =
  | { ok: true; definition: AttributeDefinition }
  | { ok: false; code: AttributeErrorCode };

/**
 * The filterable-attribute registry client. Same discipline as
 * `TiersService`: the declared refusals (409 duplicate name or slug, 404 gone)
 * come back as typed results, and only the unexpected throws.
 */
@Injectable({ providedIn: 'root' })
export class AttributesService {
  private client = createApiClient(attributesContract);

  async list(): Promise<AttributeDefinition[]> {
    const response = await this.client.listAttributes();
    if (response.status === 200) return response.body.definitions;
    throw new Error(`Failed to list attributes (status ${response.status})`);
  }

  async create(body: AttributeDefinitionInput): Promise<AttributeResult> {
    const response = await this.client.createAttribute({ body });
    if (response.status === 201) return { ok: true, definition: response.body };
    if (response.status === 409) return { ok: false, code: response.body.code };
    throw new Error(`Failed to create attribute (status ${response.status})`);
  }

  async update(
    id: string,
    body: AttributeDefinitionInput,
  ): Promise<AttributeResult> {
    const response = await this.client.updateAttribute({
      params: { id },
      body,
    });
    if (response.status === 200) return { ok: true, definition: response.body };
    if (response.status === 409 || response.status === 404) {
      return { ok: false, code: response.body.code };
    }
    throw new Error(`Failed to save attribute (status ${response.status})`);
  }

  /** Commits a whole filter-panel order; returns the list as stored. */
  async reorder(
    body: ReorderAttributesRequest,
  ): Promise<AttributeDefinition[]> {
    const response = await this.client.reorderAttributes({ body });
    if (response.status === 200) return response.body.definitions;
    throw new Error(`Failed to reorder attributes (status ${response.status})`);
  }

  /** Every attribute key in use across the catalog, declared or freetext. */
  async listKeys(): Promise<AttributeKeyUsage[]> {
    const response = await this.client.listAttributeKeys();
    if (response.status === 200) return response.body.keys;
    throw new Error(`Failed to list attribute keys (${response.status})`);
  }

  /** The values in use under one key, numbers first and in numeric order. */
  async listValues(key: string): Promise<AttributeValueUsage[]> {
    const response = await this.client.listAttributeValues({ query: { key } });
    if (response.status === 200) return response.body.values;
    throw new Error(`Failed to list attribute values (${response.status})`);
  }

  /** Rewrites a key on every product carrying it; returns how many rows moved. */
  async renameKey(body: RenameAttributeKeyRequest): Promise<number> {
    const response = await this.client.renameAttributeKey({ body });
    if (response.status === 200) return response.body.updated;
    throw new Error(`Failed to rename the attribute (${response.status})`);
  }

  async renameValue(body: RenameAttributeValueRequest): Promise<number> {
    const response = await this.client.renameAttributeValue({ body });
    if (response.status === 200) return response.body.updated;
    throw new Error(`Failed to rename the value (${response.status})`);
  }

  /** One category's filter panel, resolved (FR-ATTR-11). */
  async categoryFilters(slug: string): Promise<CategoryFilters | null> {
    const response = await this.client.getCategoryFilters({ params: { slug } });
    if (response.status === 200) return response.body;
    if (response.status === 404) return null;
    throw new Error(`Failed to load the category filters (${response.status})`);
  }

  /** Replaces the panel wholesale; returns it as stored. */
  async saveCategoryFilters(
    slug: string,
    body: SaveCategoryFiltersRequest,
  ): Promise<CategoryFilters | null> {
    const response = await this.client.saveCategoryFilters({
      params: { slug },
      body,
    });
    if (response.status === 200) return response.body;
    if (response.status === 404) return null;
    throw new Error(`Failed to save the category filters (${response.status})`);
  }

  /** Drops the overlay, so the category inherits again. */
  async resetCategoryFilters(slug: string): Promise<CategoryFilters | null> {
    const response = await this.client.resetCategoryFilters({
      params: { slug },
      body: undefined,
    });
    if (response.status === 200) return response.body;
    if (response.status === 404) return null;
    throw new Error(
      `Failed to reset the category filters (${response.status})`,
    );
  }

  /**
   * Deleting a definition only stops the attribute being filterable — no
   * product data hangs off it — so the only refusal here is "already gone".
   */
  async remove(
    id: string,
  ): Promise<{ ok: true } | { ok: false; code: AttributeErrorCode }> {
    const response = await this.client.deleteAttribute({
      params: { id },
      body: undefined,
    });
    if (response.status === 200) return { ok: true };
    if (response.status === 404) return { ok: false, code: response.body.code };
    throw new Error(`Failed to delete attribute (status ${response.status})`);
  }
}
