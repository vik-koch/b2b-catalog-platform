import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DRIZZLE } from '../db/database.module';
import * as schema from '../db/schema';
import { appSettings, settingChanges } from '../db/schema';

/** The singleton row's fixed primary key (see the `id = 1` check constraint). */
const SETTINGS_ID = 1;

/** The switches, as every read and write hands them back. */
const RETURNED_SETTINGS = {
  maintenanceMode: appSettings.maintenanceMode,
  externallyOwnedAreas: appSettings.externallyOwnedAreas,
};

export type SettingsRow = Pick<
  typeof appSettings.$inferSelect,
  keyof typeof RETURNED_SETTINGS
>;

/** One record for the trail; the store adds who and when. */
export type SettingChangeRecord = Pick<
  typeof settingChanges.$inferInsert,
  'kind' | 'area' | 'enabled'
>;

/** What a change decides, given the row as it stands under the lock. */
export interface SettingsDecision {
  set: Partial<SettingsRow>;
  record: SettingChangeRecord[];
}

/** What a missing row or an unreadable table reads as: not in maintenance,
 * nothing handed over. */
const SAFE_DEFAULT: SettingsRow = {
  maintenanceMode: false,
  externallyOwnedAreas: [],
};

const WARM_CACHE_ATTEMPTS = 15;
const WARM_CACHE_RETRY_MS = 1000;

/**
 * The runtime settings row and its trail, with no opinion on what a switch
 * means: each area reads its own and writes it through `change`. Read on every
 * request, so cached in process, refreshed at boot and on each write.
 */
@Injectable()
export class SettingsStore implements OnModuleInit {
  private readonly logger = new Logger(SettingsStore.name);
  private cached: SettingsRow = SAFE_DEFAULT;

  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  async onModuleInit(): Promise<void> {
    // The e2e harness migrates while the server starts, so a missing table
    // retries in the background on the safe default.
    await this.warmCache(1);
  }

  private async warmCache(attempt: number): Promise<void> {
    try {
      this.cached = await this.read();
      this.logger.log(`Runtime settings at startup: ${describe(this.cached)}`);
    } catch {
      if (attempt >= WARM_CACHE_ATTEMPTS) {
        this.logger.warn(
          `Could not read the settings after ${attempt} attempts; on the safe default until the next write`,
        );
        return;
      }
      setTimeout(
        () => void this.warmCache(attempt + 1),
        WARM_CACHE_RETRY_MS,
      ).unref?.();
    }
  }

  /** The cache, for the hot paths. */
  current(): Readonly<SettingsRow> {
    return this.cached;
  }

  /** The row from the database, for a screen that must show the truth. */
  async read(): Promise<SettingsRow> {
    const [row] = await this.db
      .select(RETURNED_SETTINGS)
      .from(appSettings)
      .where(eq(appSettings.id, SETTINGS_ID));
    return row ?? SAFE_DEFAULT;
  }

  /** `decide` sees the locked row and names what to set and record, all in
   * one transaction, whose shared timestamp shows several records as one
   * decision. */
  async change(
    actor: { id: string; email: string },
    decide: (before: Readonly<SettingsRow>) => SettingsDecision,
  ): Promise<SettingsRow> {
    const written = await this.db.transaction(async (tx) => {
      const [before] = await tx
        .select(RETURNED_SETTINGS)
        .from(appSettings)
        .for('update');
      const { set, record } = decide(before ?? SAFE_DEFAULT);
      const values = { ...set, updatedAt: new Date(), updatedBy: actor.id };
      const [row] = await tx
        .insert(appSettings)
        .values(values)
        .onConflictDoUpdate({ target: appSettings.id, set: values })
        .returning(RETURNED_SETTINGS);
      if (record.length) {
        await tx.insert(settingChanges).values(
          record.map((change) => ({
            ...change,
            changedBy: actor.id,
            changedByEmail: actor.email,
          })),
        );
      }
      return row;
    });
    this.cached = written;
    return written;
  }
}

function describe(row: SettingsRow): string {
  return Object.entries(row)
    .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
    .join(', ');
}
