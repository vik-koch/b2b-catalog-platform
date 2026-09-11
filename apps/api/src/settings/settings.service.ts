import {
  AppSettings,
  BuildInfo,
  OwnershipArea,
  SETTING_CHANGES_PAGE_SIZE,
  SettingChange,
} from '@b2b-catalog-platform/shared';
import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { desc, eq } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DRIZZLE } from '../db/database.module';
import * as schema from '../db/schema';
import { appSettings, settingChanges, users } from '../db/schema';
import { env } from '../env';

/** The singleton row's fixed primary key (see the `id = 1` check constraint). */
const SETTINGS_ID = 1;

/** The singleton, as it is read and as every write hands it back. */
const RETURNED_SETTINGS = {
  maintenanceMode: appSettings.maintenanceMode,
  externallyOwnedAreas: appSettings.externallyOwnedAreas,
  updatedAt: appSettings.updatedAt,
};

interface SettingsRow {
  maintenanceMode: boolean;
  externallyOwnedAreas: OwnershipArea[];
  updatedAt: Date;
}

// Boot-time cache warm-up tolerance for a not-yet-migrated table (see onModuleInit).
const WARM_CACHE_ATTEMPTS = 15;
const WARM_CACHE_RETRY_MS = 1000;

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
  // Cached for the same reason and on the same terms as the flag above: the
  // catalog write guard asks on every product save, and the answer changes
  // about once a quarter. Same single-container caveat, same upgrade path.
  private ownedAreas: readonly OwnershipArea[] = [];

  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  async onModuleInit(): Promise<void> {
    // Warm the cache from the singleton row. A real deployment applies
    // migrations in a one-shot that finishes before the server starts, so the
    // table is present here. The e2e harness, though, starts the server
    // concurrently with the migrate step — so a missing table must not fail the
    // boot: reload in the background until it appears, staying fail-open (off)
    // until the read succeeds, rather than crashing or blocking startup.
    await this.warmCache(1);
  }

  private async warmCache(attempt: number): Promise<void> {
    try {
      const row = await this.readSettings();
      this.maintenanceEnabled = row.maintenanceMode;
      this.ownedAreas = row.externallyOwnedAreas;
      this.logger.log(
        `Maintenance mode is ${this.maintenanceEnabled ? 'ON' : 'off'} at startup`,
      );
      this.logger.log(
        this.ownedAreas.length
          ? `Externally owned at startup: ${this.ownedAreas.join(', ')}`
          : 'Nothing is externally owned at startup',
      );
    } catch {
      if (attempt >= WARM_CACHE_ATTEMPTS) {
        this.logger.warn(
          `Could not read the settings after ${attempt} attempts; defaulting to maintenance off and nothing owned until the next write`,
        );
        return;
      }
      // Non-blocking: schedule a retry and let the boot proceed.
      setTimeout(
        () => void this.warmCache(attempt + 1),
        WARM_CACHE_RETRY_MS,
      ).unref?.();
    }
  }

  /** Synchronous cached read for the hot path (the maintenance guard). */
  isMaintenanceEnabled(): boolean {
    return this.maintenanceEnabled;
  }

  /**
   * What is deployed. Straight from the environment the stack was started
   * with — no database, nothing to cache; both are absent outside a deployed
   * stack (local dev), which the panel renders as "unknown".
   */
  getBuildInfo(): BuildInfo {
    return {
      version: env.APP_VERSION ?? null,
      deployedAt: env.APP_DEPLOYED_AT ?? null,
    };
  }

  /** Both switches and the row's timestamp — the whole singleton, one read. */
  async getSettings(): Promise<AppSettings> {
    return toSettings(await this.readSettings());
  }

  async setMaintenance(
    enabled: boolean,
    user: { id: string; email: string },
  ): Promise<AppSettings> {
    const wasEnabled = (await this.readSettings()).maintenanceMode;
    const settings = {
      maintenanceMode: enabled,
      updatedAt: new Date(),
      updatedBy: user.id,
    };

    const [row] = await this.db
      .insert(appSettings)
      .values(settings)
      .onConflictDoUpdate({
        target: appSettings.id,
        set: settings,
      })
      .returning(RETURNED_SETTINGS);

    this.maintenanceEnabled = row.maintenanceMode;
    // Recorded only when it moved: a panel that re-sends the state it is
    // already showing would otherwise fill the trail with non-events.
    if (wasEnabled !== enabled) {
      await this.recordChange('maintenance', null, enabled, user);
      this.logger.log(`Maintenance mode turned ${enabled ? 'ON' : 'off'}`);
    }
    return toSettings(row);
  }

  /**
   * The singleton, whole. One read for both settings: they are one row, and
   * two selects would only make the boot warm-up ask twice.
   *
   * The seed migration guarantees the row exists; the fallback is defensive, so
   * a missing row reads as the safe state — not in maintenance, nothing handed
   * over — rather than throwing.
   */
  private async readSettings(): Promise<SettingsRow> {
    const [row] = await this.db
      .select(RETURNED_SETTINGS)
      .from(appSettings)
      .where(eq(appSettings.id, SETTINGS_ID));
    return (
      row ?? {
        maintenanceMode: false,
        externallyOwnedAreas: [],
        updatedAt: new Date(0),
      }
    );
  }

  // --- External ownership (FR-ADM-10) --------------------------------------

  /**
   * Synchronous cached read for the write guards. `readonly` on the way out so
   * a caller cannot quietly edit the cache it was handed.
   */
  isExternallyOwned(area: OwnershipArea): boolean {
    return this.ownedAreas.includes(area);
  }

  /**
   * Hand one area over, or take it back. Idempotent by construction — the
   * areas are held as a set — but a no-op still records nothing rather than a
   * change that did not happen.
   */
  async setOwnership(
    area: OwnershipArea,
    owned: boolean,
    user: { id: string; email: string },
  ): Promise<AppSettings> {
    const current = new Set((await this.readSettings()).externallyOwnedAreas);
    const wasOwned = current.has(area);
    if (owned) current.add(area);
    else current.delete(area);
    const areas = [...current];

    const settings = {
      externallyOwnedAreas: areas,
      updatedAt: new Date(),
      updatedBy: user.id,
    };
    const [row] = await this.db
      .insert(appSettings)
      .values(settings)
      .onConflictDoUpdate({ target: appSettings.id, set: settings })
      .returning(RETURNED_SETTINGS);

    this.ownedAreas = row.externallyOwnedAreas;
    if (wasOwned !== owned) {
      await this.recordChange('ownership', area, owned, user);
      this.logger.log(
        `Catalog area '${area}' is ${owned ? 'now externally owned' : 'no longer externally owned'}`,
      );
    }
    return toSettings(row);
  }

  // --- The trail -----------------------------------------------------------

  /** Append one record. Never updated, never deleted. */
  private async recordChange(
    kind: 'maintenance' | 'ownership',
    area: string | null,
    enabled: boolean,
    user: { id: string; email: string },
  ): Promise<void> {
    await this.db.insert(settingChanges).values({
      kind,
      area,
      enabled,
      changedBy: user.id,
      changedByEmail: user.email,
    });
  }

  /**
   * The recent history, newest first. Joined to `users` so a live account's
   * current address is shown rather than the one it had at the time — the
   * denormalized copy is the fallback for an account that is gone, not the
   * preferred answer.
   */
  async listChanges(): Promise<SettingChange[]> {
    const rows = await this.db
      .select({
        id: settingChanges.id,
        kind: settingChanges.kind,
        area: settingChanges.area,
        enabled: settingChanges.enabled,
        changedAt: settingChanges.changedAt,
        email: users.email,
        storedEmail: settingChanges.changedByEmail,
      })
      .from(settingChanges)
      .leftJoin(users, eq(users.id, settingChanges.changedBy))
      .orderBy(desc(settingChanges.changedAt))
      .limit(SETTING_CHANGES_PAGE_SIZE);

    return rows.map((row) => ({
      id: row.id,
      kind: row.kind,
      area: row.area,
      enabled: row.enabled,
      changedAt: row.changedAt.toISOString(),
      actorEmail: row.email ?? row.storedEmail,
    }));
  }
}

function toSettings(row: SettingsRow): AppSettings {
  return {
    maintenanceEnabled: row.maintenanceMode,
    ownedAreas: row.externallyOwnedAreas,
    updatedAt: row.updatedAt.toISOString(),
  };
}
