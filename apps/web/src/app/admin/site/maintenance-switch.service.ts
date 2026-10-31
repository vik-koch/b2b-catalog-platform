import { inject, Injectable, signal } from '@angular/core';
import { MaintenanceCheck } from '@b2b-catalog-platform/shared/core/site';
import { adminMaintenanceContract } from '../contract-routes.generated';
import { createOrpcClient } from '../../shared/core/orpc-client';
import { MaintenanceService } from '../../core/site/maintenance.service';

/**
 * The admin's maintenance toggle (FR-ADM-04). Every answer is handed to the
 * public check's memo as well, so the app instance that just changed it does
 * not go on believing the old state.
 */
@Injectable({ providedIn: 'root' })
export class MaintenanceSwitchService {
  private readonly client = createOrpcClient(adminMaintenanceContract);
  private readonly maintenance = inject(MaintenanceService);
  private readonly answered = signal<boolean | null>(null);
  private inFlight?: Promise<MaintenanceCheck>;

  /**
   * The last answer the API actually gave, or null: the panel says
   * "maintenance is on" only when the API said so, because a chip claiming a
   * mode the shop may not be in is worse than no chip.
   */
  readonly enabled = this.answered.asReadonly();

  /** Fetch once per app instance, for the panel's chip. */
  load(): Promise<MaintenanceCheck> {
    return (this.inFlight ??= this.read());
  }

  /** The switch's own page reads the truth, never the cache. */
  async read(): Promise<MaintenanceCheck> {
    return this.remember(await this.client.getMaintenance());
  }

  async set(enabled: boolean): Promise<MaintenanceCheck> {
    return this.remember(
      await this.client.setMaintenance({ body: { enabled } }),
    );
  }

  private remember(answer: MaintenanceCheck): MaintenanceCheck {
    this.answered.set(answer.enabled);
    this.inFlight = Promise.resolve(answer);
    this.maintenance.noteEnabled(answer.enabled);
    return answer;
  }
}
