import { getTableName, SQL } from 'drizzle-orm';
import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import { PgDialect } from 'drizzle-orm/pg-core';
import * as schema from '../db/schema';
import { OrderDocumentFiles } from '../orders/order-document-files';
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
    const dialect = new PgDialect();
    const tx = {
      execute: (query: SQL) => {
        executed.push(dialect.sqlToQuery(query));
        return Promise.resolve({ rowCount: executed.length });
      },
    };
    const db = {
      transaction: (run: (tx: unknown) => Promise<unknown>) => run(tx),
    } as unknown as NodePgDatabase<typeof schema>;

    result = await new RetentionSweep(
      db,
      { consentRecordDays: 30, destructionRecordDays: 365, orderDays: 1095 },
      {} as OrderDocumentFiles,
    ).sweep(now);
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

/**
 * The order half (NFR-LEGAL-14): which orders it picks, what it writes for
 * them, and that their files go only after the transaction. The scrub itself
 * is asserted where account deletion uses it (users.service.spec).
 */
describe('RetentionSweep.sweepOrders', () => {
  const now = new Date('2026-10-06T12:00:00Z');
  const real = drizzle({ client: {} as never, schema });

  const run = async (due: { id: string; userId: string | null }[]) => {
    const steps: string[] = [];
    const inserted: Record<string, unknown>[] = [];
    let picked: { sql: string; params: unknown[] } | undefined;
    const removed: (readonly string[])[] = [];

    const tx = {
      select: (fields: never) => ({
        from: (table: never) => ({
          where: (condition: never) => ({
            // The pick ends in a lock; the scrub's subqueries never do.
            for: () => {
              picked = real.select(fields).from(table).where(condition).toSQL();
              return Promise.resolve(due);
            },
          }),
        }),
      }),
      update: (table: never) => ({
        set: () => ({
          where: () => {
            steps.push(getTableName(table));
            return Promise.resolve();
          },
        }),
      }),
      insert: (table: never) => ({
        values: (rows: Record<string, unknown>[]) => {
          steps.push(getTableName(table));
          inserted.push(...rows);
          return Promise.resolve();
        },
      }),
    };
    const db = {
      transaction: async (work: (tx: unknown) => Promise<unknown>) => {
        const result = await work(tx);
        steps.push('commit');
        return result;
      },
    } as unknown as NodePgDatabase<typeof schema>;
    const documents = {
      removeForOrders: (ids: readonly string[]) => {
        steps.push('files');
        removed.push(ids);
        return Promise.resolve(0);
      },
    } as unknown as OrderDocumentFiles;

    const cleared = await new RetentionSweep(
      db,
      { consentRecordDays: 30, destructionRecordDays: 365, orderDays: 1095 },
      documents,
    ).sweepOrders(now);
    return { cleared, steps, inserted, picked, removed };
  };

  it('picks finished orders untouched for the period, not cleared before', async () => {
    const { picked } = await run([]);

    expect(picked?.sql).toContain('"orders"."status" in ($1, $2, $3)');
    expect(picked?.sql).toContain('"orders"."paymentState" <> $4');
    expect(picked?.sql).toContain('"orders"."personalDataRemovedAt" is null');
    expect(picked?.sql).toContain('"orders"."updatedAt" < $5');
    expect(picked?.params).toEqual([
      'completed',
      'declined',
      'cancelled',
      'awaiting',
      // As drizzle hands a timestamp to the driver.
      '2023-10-07T12:00:00.000Z',
    ]);
  });

  it('writes nothing when nothing is due', async () => {
    const { cleared, steps } = await run([]);

    expect(cleared).toBe(0);
    expect(steps).toEqual(['commit', 'files']);
  });

  it('clears and records in one transaction, then removes the files', async () => {
    const { cleared, steps, removed } = await run([
      { id: 'order-1', userId: 'user-1' },
      { id: 'order-2', userId: 'user-1' },
      { id: 'order-3', userId: null },
    ]);

    expect(cleared).toBe(3);
    expect(steps).toEqual([
      'order_items',
      'order_revisions',
      'orders',
      'destruction_records',
      'commit',
      'files',
    ]);
    expect(removed).toEqual([['order-1', 'order-2', 'order-3']]);
  });

  it('records each account once, and a guest order by itself', async () => {
    const { inserted } = await run([
      { id: 'order-1', userId: 'user-1' },
      { id: 'order-2', userId: 'user-1' },
      { id: 'order-3', userId: null },
    ]);

    const record = {
      categories: ['order-details', 'order-documents'],
      reason: 'retention-ended',
    };
    expect(inserted).toEqual([
      { subject: 'account', subjectId: 'user-1', ...record },
      { subject: 'order', subjectId: 'order-3', ...record },
    ]);
  });
});
