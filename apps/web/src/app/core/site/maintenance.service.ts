import { Injectable } from '@angular/core';

import { createOrpcClient } from '../../platform/orpc-client';
import { maintenanceContract } from './contract-routes.generated';

/**
 * Memoized for the app's lifetime: a visitor kept out reloads anyway. The
 * admin's switch hands its answers back here, so the app that changed it is
 * current.
 */
@Injectable({ providedIn: 'root' })
export class MaintenanceService {
  private readonly client = createOrpcClient(maintenanceContract);
  private enabled?: Promise<boolean>;

  /** Fails open: a hiccup must never hide a live shop. */
  isEnabled(): Promise<boolean> {
    return (this.enabled ??= this.fetchEnabled());
  }

  private async fetchEnabled(): Promise<boolean> {
    try {
      return (await this.client.checkMaintenance()).enabled;
    } catch {
      return false;
    }
  }

  noteEnabled(enabled: boolean): void {
    this.enabled = Promise.resolve(enabled);
  }
}
