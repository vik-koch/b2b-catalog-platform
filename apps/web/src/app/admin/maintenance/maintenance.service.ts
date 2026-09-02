import { Injectable } from '@angular/core';
import {
  MaintenanceStatus,
  settingsContract,
} from '@b2b-catalog-platform/shared';
import { createOrpcClient } from '../../core/orpc-client';

/**
 * The browser's window onto maintenance mode (FR-ADM-04). Two audiences:
 *
 *  - the public storefront asks `isEnabled()` (via the maintenance gate) to
 *    decide whether to show the maintenance screen. That read hits the public,
 *    gate-exempt endpoint and is memoized for the app's lifetime — the answer
 *    only changes when an admin toggles it, and a stuck visitor reloads anyway.
 *  - the admin panel reads and writes the toggle through the admin-only
 *    endpoints. Those are never cached: the panel must show and set the truth.
 *
 * As with every client-side gate, this is cosmetic. The API and SSR enforce
 * maintenance server-side regardless of what the browser believes.
 */
@Injectable({ providedIn: 'root' })
export class MaintenanceService {
  private readonly client = createOrpcClient(settingsContract);
  private enabled?: Promise<boolean>;

  /** Public check, memoized. Fails open (false) so a hiccup never hides a live shop. */
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

  /** Admin: the current toggle with its audit timestamp. */
  getStatus(): Promise<MaintenanceStatus> {
    return this.client.getMaintenance();
  }

  /** Admin: flip the toggle; returns the stored state. */
  async setEnabled(enabled: boolean): Promise<MaintenanceStatus> {
    const status = await this.client.setMaintenance({ body: { enabled } });
    // Keep the memoized public read consistent for this app instance.
    this.enabled = Promise.resolve(status.enabled);
    return status;
  }
}
