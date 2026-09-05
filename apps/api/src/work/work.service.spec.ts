import { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { AuthUser } from '@b2b-catalog-platform/shared';
import * as schema from '../db/schema';
import { documents, orders, products, users } from '../db/schema';
import { WorkService } from './work.service';

/**
 * The counts, without a database. What is worth pinning is the role shaping
 * (FR-WORK-04) — which keys an account is even told about — and that each
 * count narrows to the same rows as the link beside it, since a count that
 * disagrees with its list is the one way this feature can lie.
 */

interface Ask {
  table: unknown;
  /** The condition as SQL, so the filter is asserted rather than assumed. */
  where: string;
}

function testDb(counts: number[] = []) {
  const asks: Ask[] = [];
  let next = 0;
  const db = {
    $count: (table: unknown, where: SQL) => {
      asks.push({ table, where: new PgDialect().sqlToQuery(where).sql });
      return Promise.resolve(counts[next++] ?? 0);
    },
  };
  return { db: db as unknown as NodePgDatabase<typeof schema>, asks };
}

const user = (role: AuthUser['role']): AuthUser => ({
  id: 'account-1',
  email: `${role}@example.com`,
  role,
  firstName: null,
  mustChangePassword: false,
});

describe('WorkService', () => {
  it('counts the two staff queues for a manager, and no catalog', async () => {
    const { db, asks } = testDb([3, 7]);

    const counts = await new WorkService(db).countsFor(user('manager'));

    // `unpublishedProducts` is absent rather than zero: a manager cannot reach
    // the products screen, so the queue is not theirs to be told about.
    expect(counts).toEqual({ registrations: 3, orders: 7 });
    expect(asks.map((ask) => ask.table)).toEqual([users, orders]);
  });

  it('adds the catalog queues for an admin', async () => {
    const { db, asks } = testDb([1, 2, 5, 4]);

    const counts = await new WorkService(db).countsFor(user('admin'));

    expect(counts).toEqual({
      registrations: 1,
      orders: 2,
      unpublishedProducts: 5,
      expiringDocuments: 4,
    });
    expect(asks[2].table).toBe(products);
    // Off the storefront and still in the catalog: a soft-deleted row is not
    // work, because nothing is waiting for it to be published.
    expect(asks[2].where).toContain('"publishedAt" is null');
    expect(asks[2].where).toContain('"deletedAt" is null');
  });

  // Expiring and expired in one figure: they are one job, and a document
  // crosses from the first to the second on its own.
  it('counts documents that have expired or are about to', async () => {
    const { db, asks } = testDb([0, 0, 0, 2]);

    await new WorkService(db).countsFor(user('admin'));

    expect(asks[3].table).toBe(documents);
    // A document with no expiry never comes due, so it is never counted.
    expect(asks[3].where).toContain('"expiresAt" is not null');
    expect(asks[3].where).toContain('"expiresAt" <= $1');
  });

  it('counts only pending customer registrations', async () => {
    const { db, asks } = testDb([4]);

    await new WorkService(db).countsFor(user('manager'));

    expect(asks[0].where).toContain('"status" = $1');
    expect(asks[0].where).toContain('"role" = $2');
  });

  it('tells a customer only about their own orders', async () => {
    const { db, asks } = testDb();

    const counts = await new WorkService(db).countsFor(user('user'));

    // Zero until order processing gives an order a state that waits on the
    // customer — and zero without a query, since the status set is empty.
    expect(counts).toEqual({ myOrders: 0 });
    expect(asks).toEqual([]);
  });

  // The table is what keeps the two apart: a staff queue is not "zero" for a
  // customer, it is not counted for them at all, so no staff figure can reach
  // a customer's session even if one of these queries were to change shape.
  it('shares no queue between a customer and an admin', async () => {
    const forCustomer = await new WorkService(testDb().db).countsFor(
      user('user'),
    );
    const forAdmin = await new WorkService(testDb([1, 2, 3, 4]).db).countsFor(
      user('admin'),
    );

    expect(Object.keys(forCustomer).filter((key) => key in forAdmin)).toEqual(
      [],
    );
  });
});
