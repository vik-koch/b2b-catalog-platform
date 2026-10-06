import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../db/schema';
import { SyncRunLog } from './sync-run-log';

/**
 * Retention, rendered rather than executed: which statements prune writes,
 * and what each one clears.
 */
describe('SyncRunLog.prune', () => {
  const statements: { sql: string; params: unknown[] }[] = [];

  beforeAll(async () => {
    const real = drizzle({ client: {} as never, schema });
    const settle = (query: {
      toSQL: () => { sql: string; params: unknown[] };
    }) => {
      statements.push(query.toSQL());
      return Promise.resolve();
    };
    const db = {
      delete: (table: never) => ({
        where: (condition: never) =>
          settle(real.delete(table).where(condition)),
      }),
      update: (table: never) => ({
        set: (values: never) => ({
          where: (condition: never) =>
            settle(real.update(table).set(values).where(condition)),
        }),
      }),
    } as unknown as NodePgDatabase<typeof schema>;

    await new SyncRunLog(db).prune();
  });

  // NFR-LEGAL-12: a customer run's diff names people, and a deleted account's
  // details must not outlive it there.
  it("clears a customer run's diff after a day, whatever its status", () => {
    const customers = statements.find((s) => s.params.includes('customers'));

    expect(customers?.sql).toContain('"plan" = ');
    expect(customers?.sql).toContain('"rows" = ');
    expect(customers?.sql).toContain('"parseErrors" = ');
    expect(customers?.sql).not.toContain('"status"');
  });

  it("keeps every other area's diff for the whole retention window", () => {
    const others = statements.filter((s) => !s.params.includes('customers'));

    expect(others.some((s) => s.sql.includes('"plan" = '))).toBe(false);
  });
});
