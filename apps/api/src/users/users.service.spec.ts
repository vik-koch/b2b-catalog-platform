import { getTableName } from 'drizzle-orm';
import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../db/schema';
import { UsersService } from './users.service';

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
function renderingDb(captured: Captured[]) {
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

  const tx = {
    select: real.select.bind(real),
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
