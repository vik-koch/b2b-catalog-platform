import { getTableName } from 'drizzle-orm';
import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../db/schema';
import { LastAdminError, UsersService } from './users.service';

/**
 * Account deletion (FR-AUTH-06), rendered rather than executed.
 *
 * The promise the app already makes — "past orders are kept for our
 * bookkeeping, with your details removed from them" — is one UPDATE, and the
 * columns it forgets are exactly the ones nobody notices. So this asserts the
 * statement itself: which columns are scrubbed, which are deliberately left
 * alone, and that the whole thing happens inside the one transaction.
 */

interface Captured {
  table: string;
  sql: string;
  params: unknown[];
}

/**
 * A drizzle that builds statements for real and never runs them: every
 * terminal call renders to SQL and resolves. `select` is the genuine builder,
 * because the order scrub scopes its subquery with one.
 */
function renderingDb(
  captured: Captured[],
  admins: { id: string }[] = [{ id: 'user-1' }, { id: 'other-admin' }],
  locks: Captured[] = [],
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
  // which is answered with the admin rows this test wants it to see.
  const select = (...args: never[]) => {
    const builder = real.select(...(args as [never]));
    const from = builder.from.bind(builder);
    builder.from = ((table: never) => {
      const query = from(table);
      const where = query.where.bind(query);
      query.where = ((condition: never) => {
        const filtered = where(condition);
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

describe('UsersService.anonymize', () => {
  const captured: Captured[] = [];
  const statement = (table: string) =>
    captured.find((entry) => entry.table === table) ?? { sql: '', params: [] };

  beforeAll(async () => {
    const service = new UsersService(renderingDb(captured));
    await service.anonymize('user-1', 'unusable-hash');
  });

  it('does the whole thing in one transaction', () => {
    // Four statements, one callback: an account that is half-anonymized is
    // worse than one that is not.
    expect(captured.map((entry) => entry.table)).toEqual([
      'addresses',
      'order_items',
      // Every version of every order, not the current one alone: a superseded
      // revision holds the same name and the same address (ADR 0051).
      'order_revisions',
      'users',
    ]);
  });

  it('empties every free-text column an order can name someone in', () => {
    const { sql } = statement('order_revisions');

    for (const column of [
      'contactName',
      'contactEmail',
      'contactPhone',
      'partyName',
      'partyRegistrationId',
      'billingStreet',
      'billingStreet2',
      'billingPostalCode',
      'billingCity',
      'billingRegion',
      'deliveryStreet',
      'deliveryStreet2',
      'deliveryPostalCode',
      'deliveryCity',
      'deliveryRegion',
      'preferredDate',
      'customerNote',
      // A manager's account of an adjustment — their words, about this
      // customer's order.
      'note',
      // What this customer was charged — the same argument that nulls tierId.
      'tierKey',
    ]) {
      expect(sql).toContain(`"${column}"`);
    }
  });

  it('leaves the bookkeeping record intact', () => {
    const { sql } = statement('order_revisions');

    // The order, its number and its money are why it is kept at all.
    expect(sql).not.toContain('"totalMinor"');
    expect(sql).not.toContain('"reference"');
    expect(sql).not.toContain('"createdAt"');
    // And it touches this account's orders only.
    expect(sql).toContain('"orders"."userId" = $');
  });

  it('keeps a delivery order’s destination non-null, as its constraint demands', () => {
    const { sql } = statement('order_revisions');

    // `orders_fulfilment_destination` requires a delivery order to keep street,
    // postcode, city and country — so those are overwritten where they are set
    // and left null where they are not, rather than nulled outright.
    expect(sql).toContain(
      'case when "order_revisions"."deliveryStreet" is null then null else $',
    );
    expect(sql).toContain(
      'case when "order_revisions"."deliveryCity" is null then null else $',
    );
  });

  it('scrubs the customer-typed line notes, scoped to this account', () => {
    const { sql, params } = statement('order_items');

    expect(sql).toContain('set "note" = $1');
    expect(params[0]).toBeNull();
    // Scoped through this account's own orders, never all of them — by way of
    // their revisions, which is what a line hangs off.
    expect(sql).toContain(
      '"revisionId" in (select "id" from "order_revisions"',
    );
    expect(sql).toContain('"orders"."userId" = $');
  });
});

/**
 * The rule every admin-removal path shares: self-deletion, deactivation and a
 * demotion all run their write through this, so the shop cannot be left with
 * nobody who can let people back in.
 *
 * What is asserted here is the decision and the fact that it wraps the write.
 * The lock that makes two simultaneous removals serialize is Postgres doing
 * the work — `for update` on every admin row is rendered here, but only a real
 * database can show the second caller waiting for the first.
 */
describe('UsersService.removingAdmin', () => {
  const service = (admins: { id: string }[]) =>
    new UsersService(renderingDb([], admins));

  it('refuses to remove the only admin who can still sign in', async () => {
    const users = service([{ id: 'admin-1' }]);
    const write = vi.fn();

    await expect(users.removingAdmin('admin-1', write)).rejects.toThrow(
      LastAdminError,
    );
    // Refused before the write, not rolled back after it.
    expect(write).not.toHaveBeenCalled();
  });

  it('allows it while another admin remains', async () => {
    const users = service([{ id: 'admin-1' }, { id: 'admin-2' }]);

    await expect(
      users.removingAdmin('admin-1', async () => 'written'),
    ).resolves.toBe('written');
  });

  /**
   * A disabled admin is not a way back in — nobody can sign in as it to switch
   * it back on — and an anonymized one is a tombstone. Neither is counted, so
   * what is protected is the last admin who can *use* the account, not the
   * last row that happens to say `admin`. An invited one does count: the link
   * in their inbox is a way in.
   */
  it('counts only the admins who could still sign in', async () => {
    const locks: Captured[] = [];
    const users = new UsersService(renderingDb([], [{ id: 'a' }], locks));

    await users.removingAdmin('a', async () => null).catch(() => undefined);

    expect(locks[0].params).toEqual(['admin', 'active', 'invited']);
  });

  it('writes a non-admin straight through', async () => {
    const users = service([{ id: 'admin-1' }]);

    await expect(
      users.removingAdmin('customer-9', async () => 'written'),
    ).resolves.toBe('written');
  });

  it('locks every admin row, the removed one included', async () => {
    const locks: Captured[] = [];
    const users = new UsersService(renderingDb([], [{ id: 'a' }], locks));

    await users.removingAdmin('a', async () => null).catch(() => undefined);

    // Not `id <> removed`: two admins removing each other read disjoint sets,
    // each sees the other, and each proceeds. They have to contend for the
    // same rows, so the removed account's own row is locked with the rest.
    expect(locks[0].table).toBe('users for update');
    expect(locks[0].sql).not.toContain('<>');
    expect(locks[0].params).not.toContain('a');
  });
});
