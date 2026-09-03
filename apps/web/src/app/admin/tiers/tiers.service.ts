import { Injectable } from '@angular/core';
import {
  CustomerTier,
  ReorderTiersRequest,
  TIER_ERROR_CODES,
  TierErrorCode,
  TierInput,
} from '@b2b-catalog-platform/shared';
import { tiersContract } from '../../core/contract-routes.generated';
import { safe } from '@orpc/client';
import { createOrpcClient } from '../../core/orpc-client';

/**
 * A save or delete the server refused. The refusal travels as the API's own
 * code; the list looks its wording up in the admin text, so nothing the server
 * wrote reaches the screen.
 */
export type TierResult =
  { ok: true; tier: CustomerTier } | { ok: false; code: TierErrorCode };

/**
 * Every route here also declares the two auth refusals, and those are not this
 * screen's to phrase: `not-authenticated` and `insufficient-role` mean the
 * session is wrong, which the guards answer with a redirect. Only the tier
 * codes have wording in the admin text, so only they come back as results.
 */
function isTierCode(code: string): code is TierErrorCode {
  return (TIER_ERROR_CODES as readonly string[]).includes(code);
}

/**
 * The customer-tier admin client. Same discipline as `AdminCatalogService`:
 * the declared refusals (409 duplicate key, 409 still-referenced, 404 gone)
 * come back as typed results the list can render next to the row, and only the
 * unexpected throws.
 */
@Injectable({ providedIn: 'root' })
export class TiersService {
  private client = createOrpcClient(tiersContract);

  list(): Promise<{ tiers: CustomerTier[]; defaultUserCount: number }> {
    return this.client.listTiers();
  }

  async create(body: TierInput): Promise<TierResult> {
    const { error, data, isDefined } = await safe(
      this.client.createTier({ body }),
    );
    if (isDefined && isTierCode(error.code)) {
      return { ok: false, code: error.code };
    }
    if (error) throw error;
    return { ok: true, tier: data };
  }

  async update(id: string, body: TierInput): Promise<TierResult> {
    const { error, data, isDefined } = await safe(
      this.client.updateTier({ params: { id }, body }),
    );
    if (isDefined && isTierCode(error.code)) {
      return { ok: false, code: error.code };
    }
    if (error) throw error;
    return { ok: true, tier: data };
  }

  /** Commits a whole display order; returns the list as stored. */
  async reorder(body: ReorderTiersRequest): Promise<CustomerTier[]> {
    return (await this.client.reorderTiers({ body })).tiers;
  }

  /**
   * The 409 here is the delete guard: accounts or prices still reference the
   * tier. The list checks the same thing from the counts it already has, so
   * reaching this means somebody else changed one in between.
   */
  async remove(
    id: string,
  ): Promise<{ ok: true } | { ok: false; code: TierErrorCode }> {
    const { error, isDefined } = await safe(
      this.client.deleteTier({ params: { id } }),
    );
    if (isDefined && isTierCode(error.code)) {
      return { ok: false, code: error.code };
    }
    if (error) throw error;
    return { ok: true };
  }
}
