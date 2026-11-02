import { getTableName } from 'drizzle-orm';
import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../../db/schema';

export interface Captured {
  table: string;
  sql: string;
  params: unknown[];
}

/**
 * A drizzle that builds statements for real and never runs them: every
 * terminal call renders to SQL and resolves. `select` is the genuine builder,
 * because the order scrub scopes its subquery with one.
 */
export function renderingDb(
  captured: Captured[],
  admins: { id: string }[] = [{ id: 'user-1' }, { id: 'other-admin' }],
  locks: Captured[] = [],
  reads: Captured[] = [],
) {
  const real = drizzle({ client: {} as never, schema });

  const settle = (
    table: string,
    query: { toSQL: () => { sql: string; params: unknown[] } },
  ) => {
    const { sql, params } = query.toSQL();
    captured.push({ table, sql, params });
    const result = Promise.resolve() as Promise<void> & {
      returning: () => Promise<Record<string, unknown>[]>;
    };
    result.returning = async () => [{ id: 'user-1' }];
    return result;
  };

  const name = (table: unknown) => getTableName(table as never);

  // The genuine builder, because the order scrub scopes its subquery with one
  // — except for the locking read the admin guard ends with `.for('update')`,
  // which is answered with the admin rows this test wants it to see, and the
  // read of the account's open consents, answered with one.
  const select = (...args: never[]) => {
    const builder = real.select(...(args as [never]));
    const from = builder.from.bind(builder);
    builder.from = ((table: never) => {
      const query = from(table);
      const where = query.where.bind(query);
      query.where = ((condition: never) => {
        const filtered = where(condition);
        if (name(table) === 'consents') {
          const { sql, params } = filtered.toSQL();
          reads.push({ table: name(table), sql, params });
          filtered.then = ((resolve: (rows: unknown) => unknown) =>
            Promise.resolve([{ id: 'consent-1' }]).then(resolve)) as never;
        }
        filtered.for = ((mode: string) => {
          const { sql, params } = filtered.toSQL();
          locks.push({ table: `${name(table)} for ${mode}`, sql, params });
          return Promise.resolve(admins);
        }) as never;
        return filtered;
      }) as never;
      return query;
    }) as never;
    return builder;
  };

  const tx = {
    select,
    insert: (table: unknown) => ({
      values: (values: Record<string, unknown> | Record<string, unknown>[]) =>
        settle(name(table), real.insert(table as never).values(values)),
    }),
    delete: (table: unknown) => ({
      where: (condition: unknown) =>
        settle(
          name(table),
          real.delete(table as never).where(condition as never),
        ),
    }),
    update: (table: unknown) => ({
      set: (values: Record<string, unknown>) => ({
        where: (condition: unknown) =>
          settle(
            name(table),
            real
              .update(table as never)
              .set(values as never)
              .where(condition as never),
          ),
      }),
    }),
  };

  return {
    select,
    transaction: (run: (tx: unknown) => Promise<unknown>) => run(tx),
  } as unknown as NodePgDatabase<typeof schema>;
}
