import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../../db/schema';
import { SettingsRow, SettingsStore } from './settings-store';

const settingsRow = (over: Partial<SettingsRow> = {}): SettingsRow => ({
  maintenanceMode: false,
  externallyOwnedAreas: [],
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
  } as unknown as NodePgDatabase<typeof schema>;
}

/**
 * A stand-in that reads `stored` and answers a write with `written`, recording
 * the rows any `insert(...).values(...)` was handed, which is how a change
 * record is observed without a database.
 *
 * `transaction` runs its callback against the same stand-in: what a change
 * needs from a real transaction is atomicity and one timestamp, neither of
 * which a stub can be asked to prove. The e2e suite is where that is checked.
 */
function dbWriting(stored: SettingsRow, written: SettingsRow) {
  const inserted: Record<string, unknown>[] = [];
  const db = {
    select: () => ({
      from: () => ({
        where: () => Promise.resolve([stored]),
        // The change locks the singleton and has no `where`: there is one row,
        // and its primary key is a check constraint.
        for: () => Promise.resolve([stored]),
      }),
    }),
    insert: () => ({
      values: (row: Record<string, unknown> | Record<string, unknown>[]) => {
        inserted.push(...(Array.isArray(row) ? row : [row]));
        return {
          onConflictDoUpdate: () => ({
            returning: () => Promise.resolve([written]),
          }),
          // The change records have no conflict clause; they are awaited
          // directly.
          then: (resolve: (v: unknown) => unknown) => resolve(undefined),
        };
      },
    }),
    transaction: <T>(fn: (tx: unknown) => Promise<T>) => fn(db),
  } as unknown as NodePgDatabase<typeof schema>;
  return { db, inserted };
}

const ACTOR = {
  id: '00000000-0000-0000-0000-000000000001',
  email: 'admin@example.com',
};

describe('SettingsStore', () => {
  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('warms the cache from the singleton row at boot', async () => {
    const row = settingsRow({
      maintenanceMode: true,
      externallyOwnedAreas: ['catalog'],
    });
    const store = new SettingsStore(dbReturning(row));

    await store.onModuleInit();

    expect(store.current()).toEqual(row);
  });

  it('does not fail the boot when the table is not there yet', async () => {
    // The e2e harness starts the server concurrently with migrations, so the
    // table can be missing here: the boot must survive it, not crash.
    vi.useFakeTimers();
    const store = new SettingsStore(dbReturning('throw'));

    await expect(store.onModuleInit()).resolves.toBeUndefined();
    // Open for the gate, and closed for ownership: an unreadable row must not
    // hand the catalog to a system nobody configured.
    expect(store.current()).toEqual(settingsRow());
  });

  it('shows the decision the row under the lock, and caches what it wrote', async () => {
    const stored = settingsRow();
    const written = settingsRow({ maintenanceMode: true });
    const { db } = dbWriting(stored, written);
    const store = new SettingsStore(db);
    await store.onModuleInit();
    const decide = vi.fn(() => ({
      set: { maintenanceMode: true },
      record: [],
    }));

    const row = await store.change(ACTOR, decide);

    expect(decide).toHaveBeenCalledWith(stored);
    expect(row).toEqual(written);
    expect(store.current()).toEqual(written);
  });

  it('appends the records the decision names, with who made it', async () => {
    const { db, inserted } = dbWriting(settingsRow(), settingsRow());
    const store = new SettingsStore(db);

    await store.change(ACTOR, () => ({
      set: { externallyOwnedAreas: ['catalog'] },
      record: [{ kind: 'ownership', area: 'catalog', enabled: true }],
    }));

    expect(inserted).toContainEqual(
      expect.objectContaining({ externallyOwnedAreas: ['catalog'] }),
    );
    expect(inserted).toContainEqual({
      kind: 'ownership',
      area: 'catalog',
      enabled: true,
      changedBy: ACTOR.id,
      changedByEmail: ACTOR.email,
    });
  });

  it('appends nothing when the decision names no record', async () => {
    const { db, inserted } = dbWriting(settingsRow(), settingsRow());
    const store = new SettingsStore(db);

    await store.change(ACTOR, () => ({
      set: { maintenanceMode: false },
      record: [],
    }));

    expect(inserted.filter((row) => 'kind' in row)).toEqual([]);
  });
});
