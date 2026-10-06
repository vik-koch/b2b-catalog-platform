import { SQL } from 'drizzle-orm';
import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../db/schema';
import { RetentionSweep } from './retention-sweep';

/**
 * The sweep, rendered rather than executed: which statements it runs, in
 * which order, against which cutoffs. The statements themselves were checked
 * against Postgres; what can drift here is the arithmetic and the order.
 */
describe('RetentionSweep.sweep', () => {
  const now = new Date('2026-10-06T12:00:00Z');
  const executed: { sql: string; params: unknown[] }[] = [];
  let result: Awaited<ReturnType<RetentionSweep['sweep']>>;

  beforeAll(async () => {
    const real = drizzle({ client: {} as never, schema });
    const tx = {
      execute: (query: SQL) => {
        executed.push(real.dialect.sqlToQuery(query));
        return Promise.resolve({ rowCount: executed.length });
      },
    };
    const db = {
      transaction: (run: (tx: unknown) => Promise<unknown>) => run(tx),
    } as unknown as NodePgDatabase<typeof schema>;

    result = await new RetentionSweep(db, {
      consentRecordDays: 30,
      destructionRecordDays: 365,
    }).sweep(now);
  });

  it('deletes consent records first, each leaving a destruction record', () => {
    const [consents] = executed;

    expect(consents.sql).toContain('DELETE FROM consents');
    expect(consents.sql).toContain('INSERT INTO destruction_records');
    expect(consents.sql).toContain("'retention-ended'");
    expect(consents.params).toEqual([new Date('2026-09-06T12:00:00Z')]);
  });

  // Last, so the records the first statement wrote are never among them, and
  // leaving none of their own.
  it('then deletes the destruction records past their own period', () => {
    const [, records] = executed;

    expect(executed).toHaveLength(2);
    expect(records.sql).toContain('DELETE FROM destruction_records');
    expect(records.sql).not.toContain('INSERT');
    expect(records.params).toEqual([new Date('2025-10-06T12:00:00Z')]);
  });

  it('counts what each deleted', () => {
    expect(result).toEqual({ consentRecords: 1, destructionRecords: 2 });
  });
});
