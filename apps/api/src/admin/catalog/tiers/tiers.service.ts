import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { and, asc, eq, inArray, isNull, ne, sql } from 'drizzle-orm';
import {
  CustomerTier,
  ReorderTiersRequest,
  TierInput,
} from '@b2b-catalog-platform/shared/admin/catalog';
import { OWNED_TIER_FIELDS } from '@b2b-catalog-platform/shared/sync';
import { DRIZZLE } from '../../../db/database.module';
import * as schema from '../../../db/schema';
import {
  customerTiers,
  productPrices,
  products,
  users,
} from '../../../db/schema';
import { SettingsService } from '../../../settings/settings.service';
import { catalogExternallyOwned } from '../../../settings/ownership.refusals';
import { publiclyVisible } from '../../../core/catalog/product-view';
import { tierPriceCondition } from '../products/grid/tier-price-filter';

/**
 * Who a price list's account count covers: active customers. Staff, pending
 * requests and anonymized accounts carry a null `tierId` too, and none of them
 * is sold to. The delete guard counts differently (`countsFor`).
 */
const isCustomer = and(eq(users.role, 'user'), eq(users.status, 'active'));

/** A function, so each throw gets its own stack. */
const notFound = () =>
  new NotFoundException({ code: 'tier-not-found', message: 'Tier not found' });

/** Live products a list does not price: what badging it would unpublish. */
function unpricedLive(
  db: NodePgDatabase<typeof schema>,
  tierId: string | typeof customerTiers.id,
) {
  return and(publiclyVisible, tierPriceCondition(db, tierId, 'no'));
}

/**
 * The price lists (FR-AUTH-05), the badged default among them. Both foreign
 * keys into `customer_tiers` restrict, so the database is the real delete
 * guard; the counts say why before a delete is tried.
 */
@Injectable()
export class TiersService {
  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof schema>,
    private readonly settings: SettingsService,
  ) {}

  /**
   * The lists with their counts, in staff's order. Correlated counts rather
   * than grouped joins, which would multiply each other. The badged list's
   * accounts are the null `tierId`s: pointing customers at its row too would
   * give one state two spellings.
   */
  async listTiers(): Promise<{ tiers: CustomerTier[]; productCount: number }> {
    const [rows, defaultUserCount, productCount] = await Promise.all([
      this.db
        .select({
          id: customerTiers.id,
          key: customerTiers.key,
          label: customerTiers.label,
          sortOrder: customerTiers.sortOrder,
          isDefault: customerTiers.isDefault,
          updatedAt: customerTiers.updatedAt,
          // `$count`: in an `sql` subquery the outer `customer_tiers.id` would
          // bind unqualified to `users.id`.
          userCount: this.db.$count(
            users,
            and(eq(users.tierId, customerTiers.id), isCustomer),
          ),
          priceCount: this.db.$count(
            productPrices,
            eq(productPrices.tierId, customerTiers.id),
          ),
          // Zero for the badged list: every live product is priced in it.
          wouldUnpublish: this.db.$count(
            products,
            unpricedLive(this.db, customerTiers.id),
          ),
        })
        .from(customerTiers)
        .orderBy(asc(customerTiers.sortOrder), asc(customerTiers.label)),
      this.db.$count(users, and(isNull(users.tierId), isCustomer)),
      this.db.$count(products, isNull(products.deletedAt)),
    ]);

    return {
      tiers: rows.map((r) => ({
        ...r,
        userCount: r.isDefault ? defaultUserCount : r.userCount,
        updatedAt: r.updatedAt.toISOString(),
      })),
      productCount,
    };
  }

  /** A new tier goes last: nobody has placed it yet. */
  async createTier(input: TierInput, actorId: string): Promise<CustomerTier> {
    await this.assertKeyFree(input.key);

    const [{ value: maxOrder }] = await this.db
      .select({
        value:
          sql<number>`coalesce(max(${customerTiers.sortOrder}), -1)`.mapWith(
            Number,
          ),
      })
      .from(customerTiers);

    const [created] = await this.db
      .insert(customerTiers)
      .values({
        key: input.key,
        label: input.label,
        sortOrder: maxOrder + 1,
        updatedBy: actorId,
      })
      .returning();

    return this.toTier(created, 0, 0);
  }

  /**
   * The label is staff's and always open. The key is what a sync file
   * addresses the list by, so it is refused while an external system owns the
   * catalog (FR-ADM-10): retyping it would point that system at nothing.
   */
  async updateTier(
    id: string,
    input: TierInput,
    actorId: string,
  ): Promise<CustomerTier> {
    const existing = await this.tierById(id);
    if (!existing) throw notFound();

    if (input.key !== existing.key) {
      if (this.settings.isExternallyOwned('catalog')) {
        throw catalogExternallyOwned(OWNED_TIER_FIELDS.join(', '));
      }
      await this.assertKeyFree(input.key, id);
    }

    const [updated] = await this.db
      .update(customerTiers)
      .set({
        key: input.key,
        label: input.label,
        updatedAt: new Date(),
        updatedBy: actorId,
      })
      .where(eq(customerTiers.id, id))
      .returning();

    const counts = await this.countsFor(id);
    return this.toTier(updated, counts.userCount, counts.priceCount);
  }

  /**
   * Refused while anything references the tier: a cascade would silently move
   * customers and re-price products. The badged list is refused first; every
   * price resolves through it, so the badge is moved, never removed.
   */
  async deleteTier(id: string): Promise<{ message: string }> {
    const existing = await this.tierById(id);
    if (!existing) throw notFound();

    if (existing.isDefault) {
      throw new ConflictException({
        code: 'tier-is-default',
        message: 'The default price list cannot be deleted',
      });
    }

    const { userCount, priceCount } = await this.countsFor(id);
    if (userCount > 0) {
      throw new ConflictException({
        code: 'tier-has-accounts',
        message: `Tier still has ${userCount} account(s)`,
      });
    }
    if (priceCount > 0) {
      throw new ConflictException({
        code: 'tier-has-prices',
        message: `Tier still has ${priceCount} product price(s)`,
      });
    }

    await this.db.delete(customerTiers).where(eq(customerTiers.id, id));
    return { message: 'Tier deleted' };
  }

  /**
   * Moves the default badge (FR-AUTH-05), open while the catalog is owned: which
   * list the public sees is the shop's decision. Products the new list does not
   * price come off the storefront in the same transaction; the screen states
   * the figure first.
   */
  async setDefaultTier(
    id: string,
    actorId: string,
  ): Promise<{
    tiers: CustomerTier[];
    productCount: number;
    unpublished: number;
  }> {
    const target = await this.tierById(id);
    if (!target) throw notFound();
    if (target.isDefault)
      return { ...(await this.listTiers()), unpublished: 0 };

    const unpublished = await this.db.transaction(async (tx) => {
      // Cleared first: the partial unique index admits one badged row.
      await tx
        .update(customerTiers)
        .set({ isDefault: false, updatedAt: new Date(), updatedBy: actorId })
        .where(eq(customerTiers.isDefault, true));
      await tx
        .update(customerTiers)
        .set({ isDefault: true, updatedAt: new Date(), updatedBy: actorId })
        .where(eq(customerTiers.id, id));

      const stranded = await tx
        .update(products)
        .set({ publishedAt: null, publishedBy: null, updatedAt: new Date() })
        .where(unpricedLive(tx, id))
        .returning({ id: products.id });
      return stranded.length;
    });

    return { ...(await this.listTiers()), unpublished };
  }

  /** A whole ordering in one transaction. Display only: tiers do not rank. */
  async reorderTiers(
    request: ReorderTiersRequest,
    actorId: string,
  ): Promise<{ tiers: CustomerTier[]; productCount: number }> {
    const ids = request.order.map((entry) => entry.id);
    if (ids.length > 0) {
      const rows = await this.db
        .select({ id: customerTiers.id })
        .from(customerTiers)
        .where(inArray(customerTiers.id, ids));
      if (rows.length !== new Set(ids).size) {
        throw notFound();
      }
    }

    await this.db.transaction(async (tx) => {
      for (const entry of request.order) {
        await tx
          .update(customerTiers)
          .set({ sortOrder: entry.sortOrder, updatedBy: actorId })
          .where(eq(customerTiers.id, entry.id));
      }
    });

    return this.listTiers();
  }

  private async tierById(id: string) {
    const rows = await this.db
      .select()
      .from(customerTiers)
      .where(eq(customerTiers.id, id));
    return rows[0];
  }

  /**
   * Keys are unique case-insensitively, compared here rather than by a
   * `lower(key)` index: Postgres and JavaScript fold some letters differently,
   * and one implementation over a handful of rows cannot disagree with itself.
   * `exceptId` lets a tier change only the case of its own key.
   */
  private async assertKeyFree(key: string, exceptId?: string): Promise<void> {
    const folded = fold(key);
    const rows = (
      await this.db
        .select({ id: customerTiers.id, key: customerTiers.key })
        .from(customerTiers)
        .where(exceptId ? ne(customerTiers.id, exceptId) : undefined)
    ).filter((row) => fold(row.key) === folded);
    if (rows.length > 0) {
      throw new ConflictException({
        code: 'tier-key-taken',
        message: `Tier key '${key}' is already in use`,
      });
    }
  }

  /** Unfiltered by role, unlike the list: the restricting foreign key counts
   * every account, so a filtered zero could still fail the delete. */
  private async countsFor(
    id: string,
  ): Promise<{ userCount: number; priceCount: number }> {
    const [userCount, priceCount] = await Promise.all([
      this.db.$count(users, eq(users.tierId, id)),
      this.db.$count(productPrices, eq(productPrices.tierId, id)),
    ]);
    return { userCount, priceCount };
  }

  private toTier(
    row: typeof customerTiers.$inferSelect,
    userCount: number,
    priceCount: number,
    wouldUnpublish = 0,
  ): CustomerTier {
    return {
      id: row.id,
      key: row.key,
      label: row.label,
      sortOrder: row.sortOrder,
      isDefault: row.isDefault,
      userCount,
      priceCount,
      wouldUnpublish,
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}

/** One spelling of a key, for comparison only — never for storage or display. */
function fold(key: string): string {
  return key.normalize('NFC').toLowerCase();
}
