import {
  AuthUser,
  CUSTOMER_WAITING_ORDER_STATUSES,
  UserRole,
  WorkCounts,
  WorkQueue,
} from '@b2b-catalog-platform/shared';
import { Inject, Injectable } from '@nestjs/common';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DRIZZLE } from '../db/database.module';
import * as schema from '../db/schema';

const { orders, products, users } = schema;

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
  admin: ['registrations', 'orders', 'unpublishedProducts'],
  manager: ['registrations', 'orders'],
  user: ['myOrders'],
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
    unpublishedProducts: () => this.unpublishedProducts(),
    myOrders: (user) => this.myOrders(user.id),
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
   * The account's own orders that wait on the account holder. The status set
   * is empty until order processing ships, so this is a constant zero rather
   * than a query nobody can satisfy — see CUSTOMER_WAITING_ORDER_STATUSES.
   */
  private myOrders(userId: string): Promise<number> {
    if (CUSTOMER_WAITING_ORDER_STATUSES.length === 0) return Promise.resolve(0);
    return this.db.$count(
      orders,
      and(
        eq(orders.userId, userId),
        inArray(orders.status, [...CUSTOMER_WAITING_ORDER_STATUSES]),
      ),
    );
  }
}
