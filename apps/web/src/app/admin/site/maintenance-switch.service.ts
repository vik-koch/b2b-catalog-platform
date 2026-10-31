import { inject, Injectable, signal } from '@angular/core';
import { MaintenanceCheck } from '@b2b-catalog-platform/shared/core/site';
import { adminMaintenanceContract } from '../contract-routes.generated';
import { createOrpcClient } from '../../shared/core/orpc-client';
import { MaintenanceService } from '../../core/site/maintenance.service';

/** Every answer goes to the public check's memo too, so this app is current. */
@Injectable({ providedIn: 'root' })
export class MaintenanceSwitchService {
  private readonly client = createOrpcClient(adminMaintenanceContract);
  private readonly maintenance = inject(MaintenanceService);
  private readonly answered = signal<boolean | null>(null);
  private inFlight?: Promise<MaintenanceCheck>;

  /** The API's last answer, or null: no chip beats one claiming a wrong mode. */
  readonly enabled = this.answered.asReadonly();

  /** Once per app, for the panel's chip. */
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
