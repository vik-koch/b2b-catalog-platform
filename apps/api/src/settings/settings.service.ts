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
      await this.recordMaintenanceChange(enabled, user);
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
   * Hand areas over, or take them back. Idempotent by construction — the areas
   * are held as a set — and an area already where it is asked to be records
   * nothing rather than a change that did not happen.
   *
   * One transaction for the whole request, which is what lets the panel offer a
   * master switch without storing a fourth flag: the areas move together or not
   * at all, and the rows they write share the transaction's timestamp, so the
   * history can show one entry for one decision (`listChanges`).
   */
  async setOwnership(
    areas: readonly OwnershipArea[],
    owned: boolean,
    user: { id: string; email: string },
  ): Promise<AppSettings> {
    const row = await this.db.transaction(async (tx) => {
      const [before] = await tx
        .select(RETURNED_SETTINGS)
        .from(appSettings)
        .for('update');
      const current = new Set<OwnershipArea>(
        before?.externallyOwnedAreas ?? [],
      );
      const moved = areas.filter((area) => current.has(area) !== owned);
      for (const area of areas) {
        if (owned) current.add(area);
        else current.delete(area);
      }

      const settings = {
        externallyOwnedAreas: [...current],
        updatedAt: new Date(),
        updatedBy: user.id,
      };
      const [written] = await tx
        .insert(appSettings)
        .values(settings)
        .onConflictDoUpdate({ target: appSettings.id, set: settings })
        .returning(RETURNED_SETTINGS);

      // One row per area that actually moved, never one row naming the group:
      // an audit entry naming no area would leave a gap in that area's own
      // history, and the grouping is a question for the reader, not the record.
      if (moved.length) {
        await tx.insert(settingChanges).values(
          moved.map((area) => ({
            kind: 'ownership' as const,
            area,
            enabled: owned,
            changedBy: user.id,
            changedByEmail: user.email,
          })),
        );
      }
      return { written, moved };
    });

    this.ownedAreas = row.written.externallyOwnedAreas;
    if (row.moved.length) {
      this.logger.log(
        `${row.moved.join(', ')} ${row.moved.length > 1 ? 'are' : 'is'} ${
          owned ? 'now externally owned' : 'no longer externally owned'
        }`,
      );
    }
    return toSettings(row.written);
  }

  // --- The trail -----------------------------------------------------------

  /** Append one record. Never updated, never deleted. The ownership rows are
   * written inside `setOwnership`'s transaction instead, so that they share its
   * timestamp. */
  private async recordMaintenanceChange(
    enabled: boolean,
    user: { id: string; email: string },
  ): Promise<void> {
    await this.db.insert(settingChanges).values({
      kind: 'maintenance',
      area: null,
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
