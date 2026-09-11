import { inject, Injectable, signal } from '@angular/core';
import {
  AppSettings,
  OwnershipArea,
  SettingChange,
} from '@b2b-catalog-platform/shared';
import { settingsContract } from '../../core/contract-routes.generated';
import { createOrpcClient } from '../../core/orpc-client';
import { MaintenanceService } from '../maintenance/maintenance.service';

/** The fail-closed answer: assume everything is owned rather than nothing. */
const ALL_AREAS: readonly OwnershipArea[] = ['catalog'];

/**
 * The admin's window onto the runtime settings — maintenance mode and external
 * ownership (FR-ADM-10), which are one row and are read in one request.
 *
 * Two audiences. The operations page reads and writes both switches. The
 * product and category editors read only `ownedAreas`, so they can grey what
 * they will not be allowed to save; that read is cached for the app's lifetime,
 * because an admin who flips the switch is on the switch's own page and comes
 * back through a fresh editor load.
 *
 * Nothing here decides anything. The API refuses the write regardless of what
 * the browser believes; this is only what stops somebody typing into a field
 * that is going to be rejected.
 */
@Injectable({ providedIn: 'root' })
export class SettingsService {
  private readonly client = createOrpcClient(settingsContract);
  private readonly maintenance = inject(MaintenanceService);
  private readonly areas = signal<readonly OwnershipArea[] | null>(null);
  private readonly latest = signal<AppSettings | null>(null);
  private inFlight?: Promise<readonly OwnershipArea[]>;

  /**
   * The last answer the API actually gave, or null. Unlike `ownedAreas` it has
   * no fail-closed stand-in: the panel says "maintenance is on" only when the
   * API said so, because a chip claiming a mode the shop may not be in is
   * worse than no chip.
   */
  readonly settings = this.latest.asReadonly();

  /**
   * What the editors read. Null until the answer arrives — which is not the
   * same as "nothing is owned", and an editor should not paint a field
   * editable only to grey it a moment later.
   */
  readonly ownedAreas = this.areas.asReadonly();

  /** Fetch once per app instance; concurrent callers share the one request. */
  load(): Promise<readonly OwnershipArea[]> {
    return (this.inFlight ??= this.fetchAreas());
  }

  private async fetchAreas(): Promise<readonly OwnershipArea[]> {
    // Fails *closed*, unlike the public maintenance read: guessing "nothing is
    // owned" would offer an admin fields the API is about to refuse, which is a
    // worse few minutes than a greyed field that did not need to be.
    try {
      return this.remember(await this.client.getSettings()).ownedAreas;
    } catch {
      this.areas.set([...ALL_AREAS]);
      return ALL_AREAS;
    }
  }

  /** The switches' own page reads the truth, never the cache. */
  read(): Promise<AppSettings> {
    return this.client
      .getSettings()
      .then((settings) => this.remember(settings));
  }

  async setMaintenance(enabled: boolean): Promise<AppSettings> {
    return this.remember(
      await this.client.setMaintenance({ body: { enabled } }),
    );
  }

  async setOwnership(
    area: OwnershipArea,
    owned: boolean,
  ): Promise<AppSettings> {
    return this.remember(
      await this.client.setOwnership({ body: { area, owned } }),
    );
  }

  async listChanges(): Promise<SettingChange[]> {
    return (await this.client.listSettingChanges()).changes;
  }

  /** Every answer carries the whole row, so every answer refreshes the caches. */
  private remember(settings: AppSettings): AppSettings {
    this.latest.set(settings);
    this.areas.set(settings.ownedAreas);
    this.inFlight = Promise.resolve(settings.ownedAreas);
    this.maintenance.noteEnabled(settings.maintenanceEnabled);
    return settings;
  }
}
