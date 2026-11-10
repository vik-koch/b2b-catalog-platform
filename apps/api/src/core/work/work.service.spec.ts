import { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';

import { AuthUser } from '@b2b-catalog-platform/shared/platform';

import { Database } from '../../platform/db/database';
import { users } from '../accounts/accounts-schema';
import { documents, products } from '../catalog/catalog-schema';
import { syncRuns } from '../exchange/exchange-schema';
import { orders } from '../ordering/ordering-schema';
import { WorkService } from './work.service';

interface Ask {
  table: unknown;
  /** The condition as SQL, so the filter is asserted rather than assumed. */
  where: string;
  params: unknown[];
}

/** Answers each count from `counts` in order and records what was asked. */
function testDb(counts: number[] = []) {
  const asks: Ask[] = [];
  let next = 0;
  const record = (table: unknown, where: SQL) => {
    const query = new PgDialect().sqlToQuery(where);
    asks.push({ table, where: query.sql, params: query.params });
    return counts[next++] ?? 0;
  };
  const db = {
    $count: (table: unknown, where: SQL) =>
      Promise.resolve(record(table, where)),
    select: () => {
      let from: unknown;
      const chain = {
        from: (table: unknown) => {
          from = table;
          return chain;
        },
        innerJoin: () => chain,
        where: (where: SQL) =>
          Promise.resolve([{ total: record(from, where) }]),
      };
      return chain;
    },
  };
  return { db: db as unknown as Database, asks };
}

const user = (role: AuthUser['role']): AuthUser => ({
  id: 'account-1',
  email: `${role}@example.com`,
  role,
  firstName: null,
  mustChangePassword: false,
});

describe('WorkService', () => {
  it('counts the staff queues for a manager, and no catalog', async () => {
    const { db, asks } = testDb([3, 7, 1, 4]);
    const counts = await new WorkService(db, 'UTC').countsFor(user('manager'));

    // Absent, not zero: a manager cannot reach the products screen.
    expect(counts).toEqual({
      registrations: 3,
      orders: 7,
      unpaidOrders: 1,
      stagedCustomerRuns: 4,
    });
    expect(asks.map((ask) => ask.table)).toEqual([
      users,
      orders,
      orders,
      syncRuns,
    ]);
    expect(asks[3].params).toEqual(['customers', 'previewed', 'api']);
  });

  it('adds the catalog queues for an admin', async () => {
    const { db, asks } = testDb([1, 2, 3, 5, 9, 4, 6, 2, 8]);
    const counts = await new WorkService(db, 'UTC').countsFor(user('admin'));

    expect(counts).toEqual({
      registrations: 1,
      orders: 2,
      unpaidOrders: 3,
      unpublishedProducts: 5,
      unpricedProducts: 9,
      expiredDocuments: 4,
      expiringDocuments: 6,
      stagedCatalogRuns: 2,
      stagedCustomerRuns: 8,
    });
    expect(asks[3].table).toBe(products);
    expect(asks[3].where).toContain('"publishedAt" is null');
    expect(asks[3].where).toContain('"deletedAt" is null');
    // Priced: the unpriced ones are the next queue, never both.
    expect(asks[3].where).toContain('is not null');
    expect(asks[4].table).toBe(products);
    expect(asks[4].where).toContain('"isDefault"');
  });

  it('counts only automated runs left waiting for a decision', async () => {
    const { db, asks } = testDb([0, 0, 0, 0, 0, 0, 0, 2, 0]);
    const counts = await new WorkService(db, 'UTC').countsFor(user('admin'));

    expect(counts.stagedCatalogRuns).toBe(2);
    expect(asks[7].table).toBe(syncRuns);
    expect(asks[7].where).toContain('"area" = $1');
    expect(asks[7].where).toContain('"status" = $2');
    expect(asks[7].where).toContain('"source" = $3');
    expect(asks[7].params).toEqual(['catalog', 'previewed', 'api']);
  });

  it('counts the staged runs of each area separately', async () => {
    const { db, asks } = testDb([0, 0, 0, 0, 0, 0, 0, 2, 5]);
    const counts = await new WorkService(db, 'UTC').countsFor(user('admin'));

    expect(counts.stagedCatalogRuns).toBe(2);
    expect(counts.stagedCustomerRuns).toBe(5);
    expect(asks[8].table).toBe(syncRuns);
    expect(asks[8].params).toEqual(['customers', 'previewed', 'api']);
  });

  it('counts orders finished with the money not recorded', async () => {
    const { db, asks } = testDb([0, 0, 6]);
    const counts = await new WorkService(db, 'UTC').countsFor(user('manager'));

    expect(counts.unpaidOrders).toBe(6);
    expect(asks[2].table).toBe(orders);
    expect(asks[2].where).toContain('"status" = $1');
    expect(asks[2].where).toContain('"paymentState" <> $2');
  });

  // The bounds meet without overlap: today is expiring, yesterday expired.
  it('counts expired documents and expiring ones separately', async () => {
    const { db, asks } = testDb([0, 0, 0, 0, 0, 2, 3]);
    await new WorkService(db, 'UTC').countsFor(user('admin'));

    expect(asks[5].table).toBe(documents);
    expect(asks[5].where).toContain('"expiresAt" is not null');
    expect(asks[5].where).toContain('"expiresAt" < $1');
    expect(asks[6].table).toBe(documents);
    expect(asks[6].where).toContain('"expiresAt" >= $1');
    expect(asks[6].where).toContain('"expiresAt" <= $2');
  });

  // A document runs out at the end of the shop's day, wherever the server is.
  it('counts expiry from the shop’s today', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      // Already 01:00 on 27 August in Auckland.
      vi.setSystemTime(new Date('2026-08-26T13:00:00Z'));
      const { db, asks } = testDb();
      await new WorkService(db, 'Pacific/Auckland').countsFor(user('admin'));

      expect(asks[5].params).toEqual(['2026-08-27']);
      expect(asks[6].params).toEqual(['2026-08-27', '2026-09-26']);
    } finally {
      vi.useRealTimers();
    }
  });

  it('counts only pending customer registrations', async () => {
    const { db, asks } = testDb([4]);
    await new WorkService(db, 'UTC').countsFor(user('manager'));

    expect(asks[0].where).toContain('"status" = $1');
    expect(asks[0].where).toContain('"role" = $2');
  });

  it('tells a customer only about their own orders', async () => {
    const { db, asks } = testDb([2, 1]);
    const counts = await new WorkService(db, 'UTC').countsFor(user('user'));

    expect(counts).toEqual({ myPayments: 2, myPickups: 1 });
    expect(asks.map((ask) => ask.table)).toEqual([orders, orders]);
    expect(asks[0].where).toContain('"userId" = $1');
    expect(asks[1].where).toContain('"userId" = $1');
  });

  it('counts a payment due and a pickup waiting as separate queues', async () => {
    const { db, asks } = testDb([0, 0]);
    await new WorkService(db, 'UTC').countsFor(user('user'));

    // Money owed is the payment axis alone: `awaiting` clears when an order
    // ends. A delivery waits on the driver, so only a pickup is counted.
    expect(asks[0].where).toContain(`"paymentState" = $2`);
    expect(asks[0].where).not.toContain(`"fulfilmentMethod"`);
    expect(asks[1].where).toContain(`"status" = $2`);
    expect(asks[1].where).toContain(`"fulfilmentMethod" = $3`);
  });

  it('shares no queue between a customer and an admin', async () => {
    const forCustomer = await new WorkService(testDb().db, 'UTC').countsFor(
      user('user'),
    );
    const forAdmin = await new WorkService(
      testDb([1, 2, 3, 4]).db,
      'UTC',
    ).countsFor(user('admin'));

    expect(Object.keys(forCustomer).filter((key) => key in forAdmin)).toEqual(
      [],
    );
  });
});
