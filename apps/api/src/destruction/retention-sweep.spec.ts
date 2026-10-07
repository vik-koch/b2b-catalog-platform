import { getTableName } from 'drizzle-orm';
import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../db/schema';
import { OrderDocumentFiles } from '../orders/order-document-files';
import { RetentionSweep } from './retention-sweep';

/**
 * The sweep, through a real drizzle over a client that records each statement
 * and answers the pick with the consents given. Which statements, in which
 * order, against which cutoffs, and what each record names.
 */
describe('RetentionSweep.sweep', () => {
  const now = new Date('2026-10-06T12:00:00Z');

  const run = async (due: { id: string; userId: string | null }[]) => {
    const asked: { text: string; values: unknown[] }[] = [];
    const client = {
      query: async (
        query: string | { text: string },
        values: unknown[] = [],
      ) => {
        const text = typeof query === 'string' ? query : query.text;
        asked.push({ text, values });
        if (text.startsWith('select')) {
          return { rows: due.map((row) => [row.id, row.userId]), fields: [] };
        }
        return { rows: [], rowCount: 4, fields: [] };
      },
    };
    const db = drizzle({ client: client as never, schema });
    const result = await new RetentionSweep(
      db,
      { consentRecordDays: 30, destructionRecordDays: 365, orderDays: 1095 },
      {} as OrderDocumentFiles,
    ).sweep(now);
    return { asked, result };
  };

  it('picks consents withdrawn, or contact consents given, before the cutoff', async () => {
    const { asked } = await run([]);
    const pick = asked.find((query) => query.text.startsWith('select'));

    expect(pick?.text).toContain(
      'left join "consent_withdrawals" on "consent_withdrawals"."consentId" = "consents"."id"',
    );
    expect(pick?.text).toContain(
      'where ("consent_withdrawals"."withdrawnAt" < $1 or ("consent_withdrawals"."id" is null and "consents"."purpose" = $2 and "consents"."createdAt" < $3))',
    );
    expect(pick?.text).toMatch(/for update of "consents" skip locked$/);
    const cutoff = '2026-09-06T12:00:00.000Z';
    expect(pick?.values).toEqual([cutoff, 'contact', cutoff]);
  });

  it('deletes the consents and records each in the one transaction, then the old records', async () => {
    const { asked } = await run([
      { id: 'consent-1', userId: 'user-1' },
      { id: 'consent-2', userId: null },
    ]);

    expect(
      asked.map((query) => query.text.split(' (')[0].slice(0, 32)),
    ).toEqual([
      'begin',
      expect.stringMatching(/^select/),
      'delete from "consents" where "co',
      'insert into "destruction_records',
      'delete from "destruction_records',
      'commit',
    ]);
    const [, , deleted, inserted, purged] = asked;
    expect(deleted.values).toEqual(['consent-1', 'consent-2']);
    // Named by the account where there was one, else by the record itself.
    // As drizzle hands a varchar[] to the driver.
    const categories = '{"consent-record"}';
    expect(inserted.values).toEqual([
      'account',
      'user-1',
      categories,
      'retention-ended',
      'consent',
      'consent-2',
      categories,
      'retention-ended',
    ]);
    // Last, so the records just written are never among them.
    expect(purged.text).toContain(
      'where "destruction_records"."destroyedAt" < $1',
    );
    expect(purged.values).toEqual(['2025-10-06T12:00:00.000Z']);
  });

  it('writes no consent statements when none is due', async () => {
    const { asked } = await run([]);

    expect(asked.map((query) => query.text.slice(0, 32))).toEqual([
      'begin',
      expect.stringMatching(/^select/),
      'delete from "destruction_records',
      'commit',
    ]);
  });

  it('counts what each deleted', async () => {
    const { result } = await run([{ id: 'consent-1', userId: null }]);

    expect(result).toEqual({ consentRecords: 1, destructionRecords: 4 });
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
