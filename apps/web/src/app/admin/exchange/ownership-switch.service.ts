import { inject, Injectable } from '@angular/core';

import { OwnedAreas } from '@b2b-catalog-platform/shared/admin/platform';
import { OwnershipArea } from '@b2b-catalog-platform/shared/platform';

import { createOrpcClient } from '../../platform/orpc-client';
import { OwnershipService } from '../platform/ownership/ownership.service';
import { adminOwnershipSwitchContract } from './contract-routes.generated';

/** Hands areas to the back office or takes them back (FR-ADM-10). */
@Injectable({ providedIn: 'root' })
export class OwnershipSwitchService {
  private readonly client = createOrpcClient(adminOwnershipSwitchContract);
  private readonly ownership = inject(OwnershipService);

  /** The master switch sends the whole list: one transaction. */
  async set(
    areas: readonly OwnershipArea[],
    owned: boolean,
  ): Promise<OwnedAreas> {
    return this.ownership.remember(
      await this.client.setOwnership({ body: { areas: [...areas], owned } }),
    );
  }
}
