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

import { DOCUMENT_EXPIRY_WARNING_DAYS } from '@b2b-catalog-platform/shared/core/catalog';
import { SyncArea } from '@b2b-catalog-platform/shared/core/exchange';
import { MyOrderFilter } from '@b2b-catalog-platform/shared/core/ordering';
import { WorkCounts, WorkQueue } from '@b2b-catalog-platform/shared/core/work';
import {
  addIsoDays,
  AuthUser,
  shopToday,
  UserRole,
} from '@b2b-catalog-platform/shared/platform';

import { SHOP_TIME_ZONE } from '../../platform/config/deployment-config';
import { Database } from '../../platform/db/database';
import { DRIZZLE } from '../../platform/db/database.module';
import { users } from '../accounts/accounts-schema';
import { documents, products } from '../catalog/catalog-schema';
import { resolvedPriceMinor } from '../catalog/product-price';
import { syncRuns } from '../exchange/exchange-schema';
import { MY_ORDER_CONDITIONS } from '../ordering/my-order-filters';
import { orderRevisions, orders } from '../ordering/ordering-schema';

/**
 * The one authorization rule outside a guard (FR-WORK-04): the route takes any
 * session, so which queues a role sees is decided here. A queue no role names
 * is never counted, and a new role must name its queues to compile.
 */
const QUEUES_BY_ROLE: Record<UserRole, readonly WorkQueue[]> = {
  admin: [
    'registrations',
    'orders',
    'unpaidOrders',
    'unpublishedProducts',
    'unpricedProducts',
    'expiredDocuments',
    'expiringDocuments',
    'stagedCatalogRuns',
    'stagedCustomerRuns',
  ],
  manager: ['registrations', 'orders', 'unpaidOrders', 'stagedCustomerRuns'],
  user: ['myPayments', 'myPickups'],
};

/**
 * What is waiting, counted rather than stored (FR-WORK-02). Each count runs
 * the filter of the list its link opens, so the two cannot disagree.
 */
@Injectable()
export class WorkService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(SHOP_TIME_ZONE) private readonly timeZone: string,
  ) {}

  /** Typed by queue, so a queue added to the contract needs a count here. */
  private readonly counters: Record<
    WorkQueue,
    (user: AuthUser) => Promise<number>
  > = {
    registrations: () => this.registrations(),
    orders: () => this.db.$count(orders, eq(orders.status, 'requested')),
    unpaidOrders: () => this.unpaidOrders(),
    unpublishedProducts: () => this.unpublishedProducts(),
    unpricedProducts: () => this.unpricedProducts(),
    expiredDocuments: () => this.expiredDocuments(),
    expiringDocuments: () => this.expiringDocuments(),
    stagedCatalogRuns: () => this.stagedRuns('catalog'),
    stagedCustomerRuns: () => this.stagedRuns('customers'),
    myPayments: (user) => this.myOrders(user.id, 'to-pay'),
    myPickups: (user) => this.myOrders(user.id, 'to-collect'),
  };

  async countsFor(user: AuthUser): Promise<WorkCounts> {
    const queues = QUEUES_BY_ROLE[user.role];
    const figures = await Promise.all(
      queues.map((queue) => this.counters[queue](user)),
    );
    return Object.fromEntries(
      queues.map((queue, index) => [queue, figures[index]]),
    );
  }

  /** Customers only: staff accounts are created approved. */
  private registrations(): Promise<number> {
    return this.db.$count(
      users,
      and(eq(users.status, 'pending'), eq(users.role, 'user')),
    );
  }

  /** Handed over with no payment recorded (FR-ORD-04). It stays counted until
   * somebody records one: there is no writing off. */
  private unpaidOrders(): Promise<number> {
    return this.db.$count(
      orders,
      and(eq(orders.status, 'completed'), ne(orders.paymentState, 'paid')),
    );
  }

  /** Priced only: an unpriced product cannot be published, so it is counted by
   * the next queue, whose work is pricing it. */
  private unpublishedProducts(): Promise<number> {
    return this.db.$count(
      products,
      and(
        isNull(products.publishedAt),
        isNull(products.deletedAt),
        isNotNull(resolvedPriceMinor(null)),
      ),
    );
  }

  private unpricedProducts(): Promise<number> {
    return this.db.$count(
      products,
      and(isNull(products.deletedAt), isNull(resolvedPriceMinor(null))),
    );
  }

  private expiredDocuments(): Promise<number> {
    return this.db.$count(
      documents,
      and(
        isNotNull(documents.expiresAt),
        lt(documents.expiresAt, shopToday(this.timeZone)),
      ),
    );
  }

  /** Bounded in days here rather than in SQL, so it is the same arithmetic as
   * the badge and the list filter. Today counts as expiring, not expired. */
  private expiringDocuments(): Promise<number> {
    const today = shopToday(this.timeZone);
    const due = addIsoDays(today, DOCUMENT_EXPIRY_WARNING_DAYS);
    return this.db.$count(
      documents,
      and(
        isNotNull(documents.expiresAt),
        gte(documents.expiresAt, today),
        lte(documents.expiresAt, due),
      ),
    );
  }

  /** Automated runs only: a manual upload is also `previewed` between its
   * preview and its commit, but that is somebody's open screen, not work. */
  private stagedRuns(area: SyncArea): Promise<number> {
    return this.db.$count(
      syncRuns,
      and(
        eq(syncRuns.area, area),
        eq(syncRuns.status, 'previewed'),
        eq(syncRuns.source, 'api'),
      ),
    );
  }

  /** Joined to the revision the customer is on, as their list is: an
   * adjustment they have not seen must not empty the marker. */
  private async myOrders(userId: string, filter: MyOrderFilter) {
    const [{ total }] = await this.db
      .select({ total: count() })
      .from(orders)
      .innerJoin(
        orderRevisions,
        eq(orders.customerRevisionId, orderRevisions.id),
      )
      .where(and(eq(orders.userId, userId), MY_ORDER_CONDITIONS[filter]));
    return total;
  }
}
