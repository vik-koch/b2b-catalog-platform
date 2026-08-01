import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../db/schema';
import { env } from '../env';
import { SettingsService } from './settings.service';

/** A drizzle stand-in whose singleton read resolves to `row` (or throws). */
function dbReturning(row: { enabled: boolean; updatedAt: Date } | 'throw') {
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

describe('SettingsService', () => {
  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('warms the cache from the singleton row at boot', async () => {
    const service = new SettingsService(
      dbReturning({ enabled: true, updatedAt: new Date() }),
    );

    await service.onModuleInit();

    expect(service.isMaintenanceEnabled()).toBe(true);
  });

  it('does not fail the boot when the table is not there yet', async () => {
    // The e2e harness starts the server concurrently with migrations, so the
    // table can be missing here — the boot must survive it (fail-open), not crash.
    jest.useFakeTimers();
    const service = new SettingsService(dbReturning('throw'));

    await expect(service.onModuleInit()).resolves.toBeUndefined();
    expect(service.isMaintenanceEnabled()).toBe(false);
  });

  it('reflects a write in the cached flag', async () => {
    // Boot reads "off"; the write returns "on" — the cache must track the write.
    const db = {
      select: () => ({
        from: () => ({
          where: () =>
            Promise.resolve([{ enabled: false, updatedAt: new Date() }]),
        }),
      }),
      update: () => ({
        set: () => ({
          where: () => ({
            returning: () =>
              Promise.resolve([{ enabled: true, updatedAt: new Date() }]),
          }),
        }),
      }),
    } as unknown as NodePgDatabase<typeof schema>;
    const service = new SettingsService(db);
    await service.onModuleInit();
    expect(service.isMaintenanceEnabled()).toBe(false);

    const status = await service.setMaintenance(
      true,
      '00000000-0000-0000-0000-000000000001',
    );

    expect(status.enabled).toBe(true);
    expect(service.isMaintenanceEnabled()).toBe(true);
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
