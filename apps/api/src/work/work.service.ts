import {
  AuthUser,
  DOCUMENT_EXPIRY_WARNING_DAYS,
  isoToday,
  UserRole,
  WorkCounts,
  WorkQueue,
} from '@b2b-catalog-platform/shared';
import { Inject, Injectable } from '@nestjs/common';
import {
  and,
  count,
  eq,
  gte,
  isNotNull,
  isNull,
  lt,
  lte,
  ne,
} from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DRIZZLE } from '../db/database.module';
import * as schema from '../db/schema';

const { documents, orderRevisions, orders, products, users } = schema;

/**
 * Which queues a role is told about (FR-WORK-04), as a table rather than as a
 * branch.
 *
 * This is an authorization rule, and it is deliberately the only place one
 * lives outside a guard: the endpoint is `@Auth()` — any session — because one
 * request answers every role. So the rule is written where it cannot be
 * *partly* applied. `Record<UserRole, …>` means a new role has to name its
 * queues to compile, and a queue named by nobody is simply never counted,
 * which is the safe direction to fail in.
 *
 * Both staff roles approve registrations and answer orders; only an admin has
 * the catalog, and a count linking somewhere its reader may not go is worse
 * than no count. A customer shares no queue with staff — their orders count is
 * their own rows, not the shop's.
 */
const QUEUES_BY_ROLE: Record<UserRole, readonly WorkQueue[]> = {
  admin: [
    'registrations',
    'orders',
    'unpaidOrders',
    'unpublishedProducts',
    'expiredDocuments',
    'expiringDocuments',
  ],
  manager: ['registrations', 'orders', 'unpaidOrders'],
  user: ['myPayments', 'myPickups'],
};

/**
 * What is waiting, counted rather than stored (ADR 0046, FR-WORK-02). Every
 * figure here is a `COUNT` over the very filter the panel's link opens, so a
 * count and the list it leads to can never disagree, and neither can be
 * acknowledged into silence.
 *
 * The map is shaped by role: a queue the account cannot act on is absent, not
 * zero.
 */
@Injectable()
export class WorkService {
  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  /**
   * One query per queue. `Record<WorkQueue, …>` is the other half of the
   * table: a queue added to the contract has to be given a count here before
   * this compiles.
   */
  private readonly counters: Record<
    WorkQueue,
    (user: AuthUser) => Promise<number>
  > = {
    registrations: () => this.registrations(),
    orders: () => this.staffOrders(),
    unpaidOrders: () => this.unpaidOrders(),
    unpublishedProducts: () => this.unpublishedProducts(),
    expiredDocuments: () => this.expiredDocuments(),
    expiringDocuments: () => this.expiringDocuments(),
    myPayments: (user) => this.myPayments(user.id),
    myPickups: (user) => this.myPickups(user.id),
  };

  async countsFor(user: AuthUser): Promise<WorkCounts> {
    const queues = QUEUES_BY_ROLE[user.role];
    const figures = await Promise.all(
      queues.map((queue) => this.counters[queue](user)),
    );

    const counts: WorkCounts = {};
    queues.forEach((queue, index) => (counts[queue] = figures[index]));
    return counts;
  }

  /** Accounts that asked for access and have not been answered (FR-AUTH-01).
   * Customers only: staff accounts are created already approved. */
  private registrations(): Promise<number> {
    return this.db.$count(
      users,
      and(eq(users.status, 'pending'), eq(users.role, 'user')),
    );
  }

  /** Order requests nobody has answered — the staff list's default filter. */
  private staffOrders(): Promise<number> {
    return this.db.$count(orders, eq(orders.status, 'requested'));
  }

  /**
   * Orders handed over with the money not recorded (FR-ORD-04) — the shop's
   * last move on an order, and the one nothing else prompts for.
   *
   * The predicate is `awaitsPaymentRecord`, written in SQL here and in
   * TypeScript in the shared table; the staff list's `unpaid` filter narrows
   * to the same rows, so the figure and the list it opens are the same
   * question asked twice.
   *
   * It does not empty by itself the way `requested` does: an order handed over
   * and never paid for stays counted until somebody records it. That is the
   * honest reading — it is a real open item — and there is no writing off.
   */
  private unpaidOrders(): Promise<number> {
    return this.db.$count(
      orders,
      and(eq(orders.status, 'completed'), ne(orders.paymentState, 'paid')),
    );
  }

  /**
   * Products off the storefront awaiting review (FR-ADM-06) — what a sync run
   * leaves behind. Soft-deleted rows are not work: nothing is waiting on a
   * product the source system has dropped.
   */
  private unpublishedProducts(): Promise<number> {
    return this.db.$count(
      products,
      and(isNull(products.publishedAt), isNull(products.deletedAt)),
    );
  }

  /**
   * Documents whose expiry has already passed (FR-DOC-04) — the shop out of
   * compliance now, and the more urgent half of the pair.
   */
  private expiredDocuments(): Promise<number> {
    return this.db.$count(
      documents,
      and(
        isNotNull(documents.expiresAt),
        lt(documents.expiresAt, isoToday(new Date())),
      ),
    );
  }

  /**
   * Documents due to expire inside the warning window (FR-DOC-04). A document
   * with no expiry never comes due and is never counted, and one that has
   * already expired is counted by the queue above rather than twice here.
   *
   * The bounds are computed here rather than in SQL so they are the same day
   * arithmetic the badge and the filter use — a count that disagreed with the
   * list it links to by a day would be unexplainable.
   */
  private expiringDocuments(): Promise<number> {
    const due = new Date();
    due.setUTCDate(due.getUTCDate() + DOCUMENT_EXPIRY_WARNING_DAYS);
    return this.db.$count(
      documents,
      and(
        isNotNull(documents.expiresAt),
        gte(documents.expiresAt, isoToday(new Date())),
        lte(documents.expiresAt, isoToday(due)),
      ),
    );
  }

  /**
   * The account's own orders the shop is waiting to be paid for (FR-WORK-04) —
   * one of the two things only the customer can finish (ADR 0050).
   *
   * `awaiting` is the whole rule: it is set when an invoiced order is accepted
   * and cleared when the order ends, so nothing here has to say which statuses
   * count.
   */
  private myPayments(userId: string): Promise<number> {
    return this.db.$count(
      orders,
      and(eq(orders.userId, userId), eq(orders.paymentState, 'awaiting')),
    );
  }

  /**
   * The account's own orders packed and waiting to be collected — the other
   * one, and the other half of what used to be a single figure. Counted apart
   * because paying an invoice and driving to the counter are two jobs, and one
   * count over both could link to neither list.
   *
   * A delivered order is not here: it waits on the driver, not on the person
   * who ordered it.
   */
  private async myPickups(userId: string): Promise<number> {
    // Joined to the version the *customer* is on, not the one the order now
    // stands at: how an order is fulfilled is part of what it says and an
    // adjustment can change it (ADR 0051), so a switch to delivery nobody has
    // told them about must not empty a marker that links to a list still
    // showing the collection they were promised.
    const [{ total }] = await this.db
      .select({ total: count() })
      .from(orders)
      .innerJoin(
        orderRevisions,
        eq(orders.customerRevisionId, orderRevisions.id),
      )
      .where(
        and(
          eq(orders.userId, userId),
          eq(orders.status, 'ready'),
          eq(orderRevisions.fulfilmentMethod, 'pickup'),
        ),
      );
    return total;
  }
}
