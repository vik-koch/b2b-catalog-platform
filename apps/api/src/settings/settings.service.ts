import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq } from 'drizzle-orm';
import { MaintenanceStatus } from '@b2b-catalog-platform/shared';
import { DRIZZLE } from '../db/database.module';
import * as schema from '../db/schema';
import { appSettings } from '../db/schema';

/** The singleton row's fixed primary key (see the `id = 1` check constraint). */
const SETTINGS_ID = 1;

/**
 * Owns the runtime settings singleton. The maintenance flag is read on every
 * request by the maintenance guard, so it is cached in-process and refreshed
 * only on toggle (and once at boot) rather than hit in the database per request
 * — the flag is read-mostly and almost always off. The cache is per API
 * instance, matching the single-container deployment; a shared cache is the
 * documented upgrade once the API runs more than one replica.
 */
@Injectable()
export class SettingsService implements OnModuleInit {
  private readonly logger = new Logger(SettingsService.name);
  private maintenanceEnabled = false;

  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  async onModuleInit(): Promise<void> {
    const status = await this.readMaintenance();
    this.maintenanceEnabled = status.enabled;
    this.logger.log(
      `Maintenance mode is ${status.enabled ? 'ON' : 'off'} at startup`,
    );
  }

  /** Synchronous cached read for the hot path (the maintenance guard). */
  isMaintenanceEnabled(): boolean {
    return this.maintenanceEnabled;
  }

  async getMaintenance(): Promise<MaintenanceStatus> {
    return this.readMaintenance();
  }

  async setMaintenance(
    enabled: boolean,
    userId: string,
  ): Promise<MaintenanceStatus> {
    const [row] = await this.db
      .update(appSettings)
      .set({
        maintenanceMode: enabled,
        updatedAt: new Date(),
        updatedBy: userId,
      })
      .where(eq(appSettings.id, SETTINGS_ID))
      .returning({
        enabled: appSettings.maintenanceMode,
        updatedAt: appSettings.updatedAt,
      });
    this.maintenanceEnabled = row.enabled;
    this.logger.log(`Maintenance mode turned ${enabled ? 'ON' : 'off'}`);
    return toStatus(row);
  }

  private async readMaintenance(): Promise<MaintenanceStatus> {
    const [row] = await this.db
      .select({
        enabled: appSettings.maintenanceMode,
        updatedAt: appSettings.updatedAt,
      })
      .from(appSettings)
      .where(eq(appSettings.id, SETTINGS_ID));
    // The seed migration guarantees the row exists; fall back defensively so a
    // missing row reads as "not in maintenance" rather than throwing.
    return row
      ? toStatus(row)
      : { enabled: false, updatedAt: new Date(0).toISOString() };
  }
}

function toStatus(row: {
  enabled: boolean;
  updatedAt: Date;
}): MaintenanceStatus {
  return { enabled: row.enabled, updatedAt: row.updatedAt.toISOString() };
}
