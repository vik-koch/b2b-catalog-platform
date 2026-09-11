import { OwnershipArea } from '@b2b-catalog-platform/shared';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../db/schema';
import { env } from '../env';
import { SettingsService } from './settings.service';

/** The singleton as `readSettings` selects it. */
type SettingsRow = {
  maintenanceMode: boolean;
  externallyOwnedAreas: OwnershipArea[];
  updatedAt: Date;
};

const settingsRow = (over: Partial<SettingsRow> = {}): SettingsRow => ({
  maintenanceMode: false,
  externallyOwnedAreas: [],
  updatedAt: new Date(),
  ...over,
});

/** A drizzle stand-in whose singleton read resolves to `row` (or throws). */
function dbReturning(row: SettingsRow | 'throw') {
  return {
    select: () => {
      if (row === 'throw') {
        throw new Error('relation "app_settings" does not exist');
      }
      return { from: () => ({ where: () => Promise.resolve([row]) }) };
    },
    update: () => ({
      set: () => ({
        where: () => ({ returning: () => Promise.resolve([row]) }),
      }),
    }),
  } as unknown as NodePgDatabase<typeof schema>;
}

/**
 * A stand-in that reads `stored` and answers a write with `written`, recording
 * the rows any `insert(...).values(...)` was handed — which is how a change
 * record is observed without a database.
 */
function dbWriting(stored: SettingsRow, written: SettingsRow) {
  const inserted: Record<string, unknown>[] = [];
  const db = {
    select: () => ({
      from: () => ({ where: () => Promise.resolve([stored]) }),
    }),
    insert: () => ({
      values: (row: Record<string, unknown>) => {
        inserted.push(row);
        return {
          onConflictDoUpdate: () => ({
            returning: () => Promise.resolve([written]),
          }),
          // The change record has no conflict clause; it is awaited directly.
          then: (resolve: (v: unknown) => unknown) => resolve(undefined),
        };
      },
    }),
  } as unknown as NodePgDatabase<typeof schema>;
  return { db, inserted };
}

const ACTOR = {
  id: '00000000-0000-0000-0000-000000000001',
  email: 'admin@example.com',
};

describe('SettingsService', () => {
  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('warms the cache from the singleton row at boot', async () => {
    const service = new SettingsService(
      dbReturning(
        settingsRow({
          maintenanceMode: true,
          externallyOwnedAreas: ['catalog'],
        }),
      ),
    );

    await service.onModuleInit();

    expect(service.isMaintenanceEnabled()).toBe(true);
    expect(service.isExternallyOwned('catalog')).toBe(true);
  });

  it('does not fail the boot when the table is not there yet', async () => {
    // The e2e harness starts the server concurrently with migrations, so the
    // table can be missing here — the boot must survive it (fail-open), not crash.
    vi.useFakeTimers();
    const service = new SettingsService(dbReturning('throw'));

    await expect(service.onModuleInit()).resolves.toBeUndefined();
    expect(service.isMaintenanceEnabled()).toBe(false);
    // Fail-open for the gate is fail-*closed* for ownership: an unreadable
    // settings row must not hand the catalog to a system nobody configured.
    expect(service.isExternallyOwned('catalog')).toBe(false);
  });

  it('reflects a write in the cached flag, and records the change', async () => {
    // Boot reads "off"; the write returns "on" — the cache must track the write.
    const { db, inserted } = dbWriting(
      settingsRow(),
      settingsRow({ maintenanceMode: true }),
    );
    const service = new SettingsService(db);
    await service.onModuleInit();
    expect(service.isMaintenanceEnabled()).toBe(false);

    const status = await service.setMaintenance(true, ACTOR);

    expect(status.maintenanceEnabled).toBe(true);
    expect(service.isMaintenanceEnabled()).toBe(true);
    expect(inserted).toContainEqual(
      expect.objectContaining({
        kind: 'maintenance',
        area: null,
        enabled: true,
        changedByEmail: ACTOR.email,
      }),
    );
  });

  describe('external ownership', () => {
    it('hands an area over, caches it, and records who did it', async () => {
      const { db, inserted } = dbWriting(
        settingsRow(),
        settingsRow({ externallyOwnedAreas: ['catalog'] }),
      );
      const service = new SettingsService(db);
      await service.onModuleInit();
      expect(service.isExternallyOwned('catalog')).toBe(false);

      const status = await service.setOwnership('catalog', true, ACTOR);

      expect(status.ownedAreas).toEqual(['catalog']);
      expect(service.isExternallyOwned('catalog')).toBe(true);
      expect(inserted).toContainEqual(
        expect.objectContaining({
          kind: 'ownership',
          area: 'catalog',
          enabled: true,
          changedByEmail: ACTOR.email,
        }),
      );
    });

    it('takes it back', async () => {
      const { db } = dbWriting(
        settingsRow({ externallyOwnedAreas: ['catalog'] }),
        settingsRow(),
      );
      const service = new SettingsService(db);
      await service.onModuleInit();
      expect(service.isExternallyOwned('catalog')).toBe(true);

      await service.setOwnership('catalog', false, ACTOR);

      expect(service.isExternallyOwned('catalog')).toBe(false);
    });

    it('records nothing when the switch was already that way', async () => {
      // The panel re-sending the state it is showing is not an event, and a
      // trail full of non-events is one nobody reads.
      const { db, inserted } = dbWriting(
        settingsRow({ externallyOwnedAreas: ['catalog'] }),
        settingsRow({ externallyOwnedAreas: ['catalog'] }),
      );
      const service = new SettingsService(db);
      await service.onModuleInit();

      await service.setOwnership('catalog', true, ACTOR);

      expect(inserted.filter((row) => row['kind'] === 'ownership')).toEqual([]);
    });
  });

  describe('build info', () => {
    // `env` is parsed once at import; these two are the only settings read
    // straight off it, so patch and restore them rather than re-import the
    // module (which would leak a second parsed copy into later tests).
    const original = { ...env };
    afterEach(() => Object.assign(env, original));

    it('reports the version and deploy time the stack was started with', () => {
      Object.assign(env, {
        APP_VERSION: '1.4.0',
        APP_DEPLOYED_AT: '2026-08-01T10:00:00Z',
      });

      expect(new SettingsService(dbReturning('throw')).getBuildInfo()).toEqual({
        version: '1.4.0',
        deployedAt: '2026-08-01T10:00:00Z',
      });
    });

    it('reports nulls outside a deployed stack', () => {
      // Local dev and a bare `docker compose up` set neither.
      Object.assign(env, {
        APP_VERSION: undefined,
        APP_DEPLOYED_AT: undefined,
      });

      expect(new SettingsService(dbReturning('throw')).getBuildInfo()).toEqual({
        version: null,
        deployedAt: null,
      });
    });
  });
});
