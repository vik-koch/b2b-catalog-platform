import { Injectable } from '@angular/core';
import { settingsContract } from '../../core/contract-routes.generated';
import { createOrpcClient } from '../../core/orpc-client';

/**
 * The browser's window onto maintenance mode (FR-ADM-04). Two audiences:
 *
 *  - the public storefront asks `isEnabled()` (via the maintenance gate) to
 *    decide whether to show the maintenance screen. That read hits the public,
 *    gate-exempt endpoint and is memoized for the app's lifetime — the answer
 *    only changes when an admin toggles it, and a stuck visitor reloads anyway.
 *  - the operations page reads and writes the toggle through SettingsService,
 *    which hands the new state back here so this memo does not go stale in the
 *    app instance that just changed it.
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

  /** What a settings read or write just learned, so the memo above is current. */
  noteEnabled(enabled: boolean): void {
    this.enabled = Promise.resolve(enabled);
  }
}
