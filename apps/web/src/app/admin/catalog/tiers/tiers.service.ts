import { Injectable } from '@angular/core';
import {
  CustomerTier,
  ReorderTiersRequest,
  TierErrorCode,
  TierInput,
} from '@b2b-catalog-platform/shared/admin/catalog';
import { tiersContract } from '../../contract-routes.generated';
import { safe, type ClientPromiseResult } from '@orpc/client';
import { createOrpcClient } from '../../../shared/core/orpc-client';
import { renderable } from '../../../shared/core/renderable';

export type TierResult =
  { ok: true; tier: CustomerTier } | { ok: false; code: TierErrorCode };

/**
 * The customer-tier client. The declared refusals come back as typed results
 * the list can render next to the row; only the unexpected throws.
 */
@Injectable({ providedIn: 'root' })
export class TiersService {
  private client = createOrpcClient(tiersContract);

  list(): Promise<{ tiers: CustomerTier[]; productCount: number }> {
    return this.client.listTiers();
  }

  /** Moves the default badge. Answers with the whole list and how many
   * products came off the storefront, so the screen need not reload. */
  setDefault(id: string): Promise<{
    tiers: CustomerTier[];
    productCount: number;
    unpublished: number;
  }> {
    return this.client.setDefaultTier({ params: { id } });
  }

  create(body: TierInput): Promise<TierResult> {
    return this.saved(this.client.createTier({ body }));
  }

  update(id: string, body: TierInput): Promise<TierResult> {
    return this.saved(this.client.updateTier({ params: { id }, body }));
  }

  /** The stored row, or the code the server refused with. */
  private async saved<TError extends Error>(
    call: ClientPromiseResult<CustomerTier, TError>,
  ): Promise<TierResult> {
    const result = await safe(call);
    if (result.isDefined && renderable(result.error.code)) {
      return { ok: false, code: result.error.code };
    }
    if (!result.isSuccess) throw result.error;
    return { ok: true, tier: result.data };
  }

  async reorder(body: ReorderTiersRequest): Promise<CustomerTier[]> {
    return (await this.client.reorderTiers({ body })).tiers;
  }

  /** The list checks the delete guard from its own counts first, so a
   * refusal here means somebody changed one in between. */
  async remove(
    id: string,
  ): Promise<{ ok: true } | { ok: false; code: TierErrorCode }> {
    const { error, isDefined } = await safe(
      this.client.deleteTier({ params: { id } }),
    );
    if (isDefined && renderable(error.code)) {
      return { ok: false, code: error.code };
    }
    if (error) throw error;
    return { ok: true };
  }
}
