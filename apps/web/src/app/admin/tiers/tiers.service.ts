import { Injectable } from '@angular/core';
import {
  CustomerTier,
  ReorderTiersRequest,
  TierErrorCode,
  TierInput,
  tiersContract,
} from '@b2b-catalog-platform/shared';
import { createApiClient } from '../../core/api-client';

/**
 * A save or delete the server refused. The refusal travels as the API's own
 * code; the list looks its wording up in the admin text, so nothing the server
 * wrote reaches the screen.
 */
export type TierResult =
  | { ok: true; tier: CustomerTier }
  | { ok: false; code: TierErrorCode };

/**
 * The customer-tier admin client. Same discipline as `AdminCatalogService`:
 * the declared refusals (409 duplicate key, 409 still-referenced, 404 gone)
 * come back as typed results the list can render next to the row, and only the
 * unexpected throws.
 */
@Injectable({ providedIn: 'root' })
export class TiersService {
  private client = createApiClient(tiersContract);

  async list(): Promise<{ tiers: CustomerTier[]; defaultUserCount: number }> {
    const response = await this.client.listTiers();
    if (response.status === 200) return response.body;
    throw new Error(`Failed to list tiers (status ${response.status})`);
  }

  async create(body: TierInput): Promise<TierResult> {
    const response = await this.client.createTier({ body });
    if (response.status === 201) return { ok: true, tier: response.body };
    if (response.status === 409) {
      return { ok: false, code: response.body.code };
    }
    throw new Error(`Failed to create tier (status ${response.status})`);
  }

  async update(id: string, body: TierInput): Promise<TierResult> {
    const response = await this.client.updateTier({ params: { id }, body });
    if (response.status === 200) return { ok: true, tier: response.body };
    if (response.status === 409 || response.status === 404) {
      return { ok: false, code: response.body.code };
    }
    throw new Error(`Failed to save tier (status ${response.status})`);
  }

  /** Commits a whole display order; returns the list as stored. */
  async reorder(body: ReorderTiersRequest): Promise<CustomerTier[]> {
    const response = await this.client.reorderTiers({ body });
    if (response.status === 200) return response.body.tiers;
    throw new Error(`Failed to reorder tiers (status ${response.status})`);
  }

  /**
   * The 409 here is the delete guard: accounts or prices still reference the
   * tier. The list checks the same thing from the counts it already has, so
   * reaching this means somebody else changed one in between.
   */
  async remove(
    id: string,
  ): Promise<{ ok: true } | { ok: false; code: TierErrorCode }> {
    const response = await this.client.deleteTier({
      params: { id },
      body: undefined,
    });
    if (response.status === 200) return { ok: true };
    if (response.status === 409 || response.status === 404) {
      return { ok: false, code: response.body.code };
    }
    throw new Error(`Failed to delete tier (status ${response.status})`);
  }
}
