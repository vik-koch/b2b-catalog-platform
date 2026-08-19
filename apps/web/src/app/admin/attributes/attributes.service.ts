import { Injectable } from '@angular/core';
import {
  AttributeDefinition,
  AttributeDefinitionInput,
  AttributeErrorCode,
  attributesContract,
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
