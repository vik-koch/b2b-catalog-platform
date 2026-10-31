import { Injectable, Logger } from '@nestjs/common';
import { MaintenanceCheck } from '@b2b-catalog-platform/shared/core/site';
import { SettingsStore } from '../../platform/settings/settings-store';

/** The admin's maintenance toggle (FR-ADM-04). */
@Injectable()
export class MaintenanceSwitch {
  private readonly logger = new Logger(MaintenanceSwitch.name);

  constructor(private readonly store: SettingsStore) {}

  async read(): Promise<MaintenanceCheck> {
    return { enabled: (await this.store.read()).maintenanceMode };
  }

  async set(
    enabled: boolean,
    actor: { id: string; email: string },
  ): Promise<MaintenanceCheck> {
    let moved = false;
    const row = await this.store.change(actor, (before) => {
      moved = before.maintenanceMode !== enabled;
      // Recorded only when it moved: a panel that re-sends the state it is
      // already showing would otherwise fill the trail with non-events.
      return {
        set: { maintenanceMode: enabled },
        record: moved ? [{ kind: 'maintenance', area: null, enabled }] : [],
      };
    });
    if (moved) {
      this.logger.log(`Maintenance mode turned ${enabled ? 'ON' : 'off'}`);
    }
    return { enabled: row.maintenanceMode };
  }
}
