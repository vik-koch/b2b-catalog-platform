import { Injectable, inject } from '@angular/core';
import { OwnedAreas } from '@b2b-catalog-platform/shared/admin/platform';
import { OwnershipArea } from '@b2b-catalog-platform/shared/platform';
import { adminOwnershipSwitchContract } from '../contract-routes.generated';
import { createOrpcClient } from '../../shared/core/orpc-client';
import { OwnershipService } from '../platform/ownership/ownership.service';

/** Hands areas to the back office or takes them back (FR-ADM-10). */
@Injectable({ providedIn: 'root' })
export class OwnershipSwitchService {
  private readonly client = createOrpcClient(adminOwnershipSwitchContract);
  private readonly ownership = inject(OwnershipService);

  /** One area or every area: the master switch is the same call with the
   * whole list, so it lands as one transaction and one history entry. */
  async set(
    areas: readonly OwnershipArea[],
    owned: boolean,
  ): Promise<OwnedAreas> {
    return this.ownership.remember(
      await this.client.setOwnership({ body: { areas: [...areas], owned } }),
    );
  }
}
