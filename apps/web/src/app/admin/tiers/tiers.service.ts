import { Injectable } from '@angular/core';
import {
  CustomerTier,
  TierInput,
  tiersContract,
} from '@b2b-catalog-platform/shared';
import { createApiClient } from '../../core/api-client';

/** A save/delete that the server refused for a reason worth showing inline. */
export type TierResult =
  | { ok: true; tier: CustomerTier }
  | { ok: false; message: string };

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
      return { ok: false, message: response.body.message };
    }
    throw new Error(`Failed to create tier (status ${response.status})`);
  }

  async update(id: string, body: TierInput): Promise<TierResult> {
    const response = await this.client.updateTier({ params: { id }, body });
    if (response.status === 200) return { ok: true, tier: response.body };
    if (response.status === 409 || response.status === 404) {
      return { ok: false, message: response.body.message };
    }
    throw new Error(`Failed to save tier (status ${response.status})`);
  }

  /**
   * The 409 here is the delete guard (accounts or prices still reference the
   * tier) and carries the count, so its message is worth showing verbatim.
   */
  async remove(
    id: string,
  ): Promise<{ ok: true } | { ok: false; message: string }> {
    const response = await this.client.deleteTier({
      params: { id },
      body: undefined,
    });
    if (response.status === 200) return { ok: true };
    if (response.status === 409 || response.status === 404) {
      return { ok: false, message: response.body.message };
    }
    throw new Error(`Failed to delete tier (status ${response.status})`);
  }
}
