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
  const record = (table: unknown, where: SQL) => {
    asks.push({ table, where: new PgDialect().sqlToQuery(where).sql });
    return counts[next++] ?? 0;
  };
  const db = {
    $count: (table: unknown, where: SQL) =>
      Promise.resolve(record(table, where)),
    // The customer's own count joins the revision each order shows, so it is a
    // select rather than a `$count` — the same question, asked over two tables.
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
  it('counts the staff queues for a manager, and no catalog', async () => {
    const { db, asks } = testDb([3, 7, 1]);

    const counts = await new WorkService(db).countsFor(user('manager'));

    // `unpublishedProducts` is absent rather than zero: a manager cannot reach
    // the products screen, so the queue is not theirs to be told about.
    expect(counts).toEqual({ registrations: 3, orders: 7, unpaidOrders: 1 });
    expect(asks.map((ask) => ask.table)).toEqual([users, orders, orders]);
  });

  it('adds the catalog queues for an admin', async () => {
    const { db, asks } = testDb([1, 2, 3, 5, 4, 6]);

    const counts = await new WorkService(db).countsFor(user('admin'));

    expect(counts).toEqual({
      registrations: 1,
      orders: 2,
      unpaidOrders: 3,
      unpublishedProducts: 5,
      expiredDocuments: 4,
      expiringDocuments: 6,
    });
    expect(asks[3].table).toBe(products);
    // Off the storefront and still in the catalog: a soft-deleted row is not
    // work, because nothing is waiting for it to be published.
    expect(asks[3].where).toContain('"publishedAt" is null');
    expect(asks[3].where).toContain('"deletedAt" is null');
  });

  // The money queue is the payment axis and the status axis together, which is
  // the one piece of work neither says on its own (ADR 0050). The staff list's
  // `unpaid` filter narrows to these very rows.
  it('counts orders finished with the money not recorded', async () => {
    const { db, asks } = testDb([0, 0, 6]);

    const counts = await new WorkService(db).countsFor(user('manager'));

    expect(counts.unpaidOrders).toBe(6);
    expect(asks[2].table).toBe(orders);
    expect(asks[2].where).toContain('"status" = $1');
    expect(asks[2].where).toContain('"paymentState" <> $2');
  });

  /**
   * Expired and expiring are counted apart, because each links to its own
   * filter on the document list — and a document counted in both would be one
   * job reported twice. The bounds meet without overlapping: today is expiring,
   * yesterday is expired.
   */
  it('counts expired documents and expiring ones separately', async () => {
    const { db, asks } = testDb([0, 0, 0, 0, 2, 3]);

    await new WorkService(db).countsFor(user('admin'));

    expect(asks[4].table).toBe(documents);
    // A document with no expiry never comes due, so it is never counted.
    expect(asks[4].where).toContain('"expiresAt" is not null');
    expect(asks[4].where).toContain('"expiresAt" < $1');

    expect(asks[5].table).toBe(documents);
    expect(asks[5].where).toContain('"expiresAt" >= $1');
    expect(asks[5].where).toContain('"expiresAt" <= $2');
  });

  it('counts only pending customer registrations', async () => {
    const { db, asks } = testDb([4]);

    await new WorkService(db).countsFor(user('manager'));

    expect(asks[0].where).toContain('"status" = $1');
    expect(asks[0].where).toContain('"role" = $2');
  });

  it('tells a customer only about their own orders', async () => {
    const { db, asks } = testDb([2, 1]);

    const counts = await new WorkService(db).countsFor(user('user'));

    expect(counts).toEqual({ myPayments: 2, myPickups: 1 });
    expect(asks.map((ask) => ask.table)).toEqual([orders, orders]);
    expect(asks[0].where).toContain('"userId" = $1');
    expect(asks[1].where).toContain('"userId" = $1');
  });

  /**
   * The two things only a customer can finish (ADR 0050), counted apart
   * because they are two jobs with two lists: money that is due from them, and
   * an order packed for them to collect. An order out for delivery waits on
   * the driver, and an order that ended waits on nobody — both would be a
   * marker the customer cannot clear (FR-WORK-02).
   */
  it('counts a payment due and a pickup waiting as separate queues', async () => {
    const { db, asks } = testDb([0, 0]);

    await new WorkService(db).countsFor(user('user'));

    // Money owed is the payment axis alone: `awaiting` is cleared when an
    // order ends, so nothing here has to name a status.
    expect(asks[0].where).toContain(`"paymentState" = $2`);
    expect(asks[0].where).not.toContain(`"fulfilmentMethod"`);

    // And the parcel on the counter is the status and the fulfilment method,
    // read off the version the *customer* is on.
    expect(asks[1].where).toContain(`"status" = $2`);
    expect(asks[1].where).toContain(`"fulfilmentMethod" = $3`);
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
