import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../db/schema';
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
});
