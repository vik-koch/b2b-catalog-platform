import { Injectable } from '@nestjs/common';
import { OwnershipArea } from '@b2b-catalog-platform/shared/sync';
import { SettingsStore } from '../platform/settings/settings-store';

/**
 * Whether an external system owns an area (FR-ADM-10), from the store's cache:
 * every guarded write asks, and the answer changes about once a quarter.
 */
@Injectable()
export class OwnershipState {
  constructor(private readonly store: SettingsStore) {}

  isExternallyOwned(area: OwnershipArea): boolean {
    return this.store.current().externallyOwnedAreas.includes(area);
  }
}
