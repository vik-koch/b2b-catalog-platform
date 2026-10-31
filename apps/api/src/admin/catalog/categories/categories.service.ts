import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { asc, count, eq, sql } from 'drizzle-orm';
import {
  AdminCategory,
  CategoryInput,
  ReorderCategoriesRequest,
} from '@b2b-catalog-platform/shared/admin/catalog';
import { DRIZZLE } from '../../../db/database.module';
import * as schema from '../../../db/schema';
import { categories, products } from '../../../db/schema';
import { SettingsService } from '../../../settings/settings.service';
import { catalogExternallyOwned } from '../../../settings/ownership.refusals';
import { changedCategoryFields } from '../owned-fields';
import { publiclyVisible } from '../../../core/catalog/product-view';
import { hasCycle } from './category-cycle';
import { subtreeCounts } from '../../../core/catalog/catalog-tree';
import {
  resolveNewSlug,
  resolveNewCategorySourceId,
  resolveSlugOverride,
  resolveCategorySourceIdOverride,
  runUnique,
} from '../catalog-identity';

/** A function, so each throw gets its own stack; the message may name the row
 * for a log reader, the code a screen reads never varies. */
export const categoryNotFound = (message = 'Category not found') =>
  new NotFoundException({ code: 'category-not-found', message });

/** That a category exists, before a row points at it: a 404 rather than a
 * foreign-key error. A function, so a product write needs no service. */
export async function assertCategoryExists(
  db: NodePgDatabase<typeof schema>,
  id: string,
): Promise<void> {
  const [row] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(eq(categories.id, id))
    .limit(1);
  if (!row) throw categoryNotFound();
}

/**
 * The category tree the catalog hangs from. Reparenting is guarded against
 * cycles; deletion is hard, since a category is structure, not content, and a
 * soft-deleted one would still hold its children.
 */
@Injectable()
export class CategoriesService {
  constructor(
    @Inject(DRIZZLE) private db: NodePgDatabase<typeof schema>,
    private readonly settings: SettingsService,
  ) {}

  async listCategories(): Promise<AdminCategory[]> {
    // Deleted products count only for the delete guard (FR-ADM-22); live is
    // the storefront's own predicate.
    const [rows, productCounts] = await Promise.all([
      this.db
        .select()
        .from(categories)
        .orderBy(asc(categories.sortOrder), asc(categories.name)),
      this.db
        .select({
          categoryId: products.categoryId,
          value:
            sql<number>`count(*) filter (where ${products.deletedAt} is null)`.mapWith(
              Number,
            ),
          live: sql<number>`count(*) filter (where ${publiclyVisible})`.mapWith(
            Number,
          ),
          deleted:
            sql<number>`count(*) filter (where ${products.deletedAt} is not null)`.mapWith(
              Number,
            ),
        })
        .from(products)
        .groupBy(products.categoryId),
    ]);

    const direct = new Map(productCounts.map((r) => [r.categoryId, r.value]));
    const deleted = new Map(
      productCounts.map((r) => [r.categoryId, r.deleted]),
    );
    const childCount = new Map<string, number>();
    for (const row of rows) {
      if (row.parentId) {
        childCount.set(row.parentId, (childCount.get(row.parentId) ?? 0) + 1);
      }
    }
    const subtree = subtreeCounts(rows, direct);
    const live = subtreeCounts(
      rows,
      new Map(productCounts.map((r) => [r.categoryId, r.live])),
    );

    return rows.map((r) =>
      toAdminCategory(r, {
        productCount: subtree.get(r.id) ?? 0,
        liveProductCount: live.get(r.id) ?? 0,
        directProductCount: direct.get(r.id) ?? 0,
        deletedProductCount: deleted.get(r.id) ?? 0,
        childCount: childCount.get(r.id) ?? 0,
      }),
    );
  }

  async createCategory(
    input: CategoryInput,
    actorId: string,
  ): Promise<AdminCategory> {
    if (input.parentId) await assertCategoryExists(this.db, input.parentId);
    const slug = await resolveNewSlug(
      this.db,
      categories,
      input.slug,
      input.name,
      'category',
    );
    // After its current siblings.
    const sortOrder = await this.nextSortOrder(input.parentId);
    const sourceId = await resolveNewCategorySourceId(this.db, input.sourceId);

    const row = await runUnique(() =>
      this.db
        .insert(categories)
        .values({
          sourceId,
          slug,
          name: input.name,
          shortName: input.shortName,
          parentId: input.parentId,
          sortOrder,
          mark: input.mark,
          updatedBy: actorId,
        })
        .returning(),
    );
    return toAdminCategory(row[0], {
      productCount: 0,
      liveProductCount: 0,
      directProductCount: 0,
      deletedProductCount: 0,
      childCount: 0,
    });
  }

  async updateCategory(
    id: string,
    input: CategoryInput,
    actorId: string,
  ): Promise<AdminCategory> {
    const existing = await this.categoryById(id);
    if (!existing) throw categoryNotFound();

    // Only the name and key belong to the exchange; restructuring the tree
    // stays open, since products keep hanging on the same leaves.
    if (this.settings.isExternallyOwned('catalog')) {
      const moved = changedCategoryFields(existing, input);
      if (moved.length) throw catalogExternallyOwned(moved.join(', '));
    }

    // A full replace, so `parentId` is authoritative.
    if (input.parentId !== existing.parentId) {
      if (input.parentId) await assertCategoryExists(this.db, input.parentId);
      await this.assertNoReparentCycle(id, input.parentId);
    }
    const newSlug = await resolveSlugOverride(
      this.db,
      categories,
      input.slug,
      existing.slug,
    );

    const newSourceId = await resolveCategorySourceIdOverride(
      this.db,
      input.sourceId,
      existing.sourceId,
    );

    await runUnique(() =>
      this.db
        .update(categories)
        .set({
          name: input.name,
          shortName: input.shortName,
          slug: newSlug,
          parentId: input.parentId,
          mark: input.mark,
          sourceId: newSourceId,
          updatedAt: new Date(),
          updatedBy: actorId,
        })
        .where(eq(categories.id, id)),
    );

    // Read back through the list: a reparent has just changed the subtree
    // counts.
    const saved = (await this.listCategories()).find((c) => c.id === id);
    if (!saved) throw categoryNotFound();
    return saved;
  }

  /**
   * Hard delete, guarded. Subcategories always block; products, soft-deleted
   * ones included (the foreign key restricts), block unless `reassignToId`
   * moves them first, in the same transaction.
   */
  async deleteCategory(
    id: string,
    reassignToId?: string,
  ): Promise<{ message: string }> {
    const existing = await this.categoryById(id);
    if (!existing) throw categoryNotFound();

    const [{ value: childCount }] = await this.db
      .select({ value: count() })
      .from(categories)
      .where(eq(categories.parentId, id));
    if (Number(childCount) > 0) {
      throw new ConflictException({
        code: 'category-has-subcategories',
        message: 'Category still has subcategories',
      });
    }

    const [{ value: productCount }] = await this.db
      .select({ value: count() })
      .from(products)
      .where(eq(products.categoryId, id));

    if (Number(productCount) === 0) {
      await this.db.delete(categories).where(eq(categories.id, id));
      return { message: 'Category deleted' };
    }

    if (!reassignToId) {
      throw new ConflictException({
        code: 'category-has-products',
        message: 'Category still has products',
      });
    }
    // Moving products writes the exchange's field; an empty category can
    // still be deleted, so while owned it is emptied from the source.
    if (this.settings.isExternallyOwned('catalog')) {
      throw catalogExternallyOwned('reassign');
    }
    if (reassignToId === id) {
      throw new ConflictException({
        code: 'category-reassign-to-self',
        message: 'Cannot reassign a category to itself',
      });
    }
    const target = await this.categoryById(reassignToId);
    if (!target) {
      throw new NotFoundException({
        code: 'reassign-target-not-found',
        message: 'Target category not found',
      });
    }

    await this.db.transaction(async (tx) => {
      // Soft-deleted products too: they hold the foreign key as well.
      await tx
        .update(products)
        .set({ categoryId: reassignToId, updatedAt: new Date() })
        .where(eq(products.categoryId, id));
      await tx.delete(categories).where(eq(categories.id, id));
    });
    return { message: 'Category deleted' };
  }

  /** Reparent/reorder in one transaction; the whole posted set is applied. */
  async reorderCategories(
    body: ReorderCategoriesRequest,
  ): Promise<AdminCategory[]> {
    const all = await this.db
      .select({ id: categories.id, parentId: categories.parentId })
      .from(categories);
    const known = new Set(all.map((c) => c.id));

    const parentById = new Map(all.map((c) => [c.id, c.parentId]));
    for (const entry of body.order) {
      if (!known.has(entry.id)) {
        throw categoryNotFound(`Unknown category ${entry.id}`);
      }
      if (entry.parentId !== null && !known.has(entry.parentId)) {
        throw categoryNotFound(`Unknown parent ${entry.parentId}`);
      }
      parentById.set(entry.id, entry.parentId);
    }
    if (hasCycle(parentById)) {
      throw new ConflictException({
        code: 'category-cycle',
        message: 'Reorder would create a category cycle',
      });
    }

    await this.db.transaction(async (tx) => {
      for (const entry of body.order) {
        await tx
          .update(categories)
          .set({
            parentId: entry.parentId,
            sortOrder: entry.sortOrder,
            updatedAt: new Date(),
          })
          .where(eq(categories.id, entry.id));
      }
    });
    return this.listCategories();
  }

  private async categoryById(id: string) {
    const [row] = await this.db
      .select()
      .from(categories)
      .where(eq(categories.id, id))
      .limit(1);
    return row;
  }

  private async nextSortOrder(parentId: string | null): Promise<number> {
    const [row] = await this.db
      .select({
        value: sql<number>`coalesce(max(${categories.sortOrder}), -1)`,
      })
      .from(categories)
      .where(
        parentId === null
          ? sql`${categories.parentId} is null`
          : eq(categories.parentId, parentId),
      );
    return Number(row.value) + 1;
  }

  /** A single reparent must not make the node its own ancestor. */
  private async assertNoReparentCycle(
    id: string,
    newParentId: string | null,
  ): Promise<void> {
    if (newParentId === null) return;
    const all = await this.db
      .select({ id: categories.id, parentId: categories.parentId })
      .from(categories);
    const parentById = new Map(all.map((c) => [c.id, c.parentId]));
    parentById.set(id, newParentId);
    if (hasCycle(parentById)) {
      throw new ConflictException({
        code: 'category-cycle',
        message: 'Move would create a category cycle',
      });
    }
  }
}

function toAdminCategory(
  row: typeof categories.$inferSelect,
  counts: Pick<
    AdminCategory,
    | 'productCount'
    | 'liveProductCount'
    | 'directProductCount'
    | 'deletedProductCount'
    | 'childCount'
  >,
): AdminCategory {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    parentId: row.parentId,
    sortOrder: row.sortOrder,
    mark: row.mark,
    sourceId: row.sourceId,
    shortName: row.shortName,
    ...counts,
  };
}
