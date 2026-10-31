import { Injectable } from '@nestjs/common';
import { SettingsStore } from '../../platform/settings/settings-store';

/** From the store's cache: the gate asks on every request. */
@Injectable()
export class MaintenanceState {
  constructor(private readonly store: SettingsStore) {}

  isEnabled(): boolean {
    return this.store.current().maintenanceMode;
  }
}
