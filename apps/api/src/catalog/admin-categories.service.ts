import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { asc, count, eq, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import {
  AdminCategory,
  CategoryInput,
  ReorderCategoriesRequest,
} from '@b2b-catalog-platform/shared';
import { DRIZZLE } from '../db/database.module';
import * as schema from '../db/schema';
import { categories, products } from '../db/schema';
import { hasCycle } from './category-cycle';
import {
  resolveNewSlug,
  resolveSlugOverride,
  resolveSourceIdOverride,
  runUnique,
} from './catalog-identity';

/**
 * A 404 rather than a foreign-key error: the editors render this message.
 * A function rather than a constant so each throw gets its own stack; the
 * message varies where naming the row helps a log reader, while the code — the
 * only part a screen reads — does not.
 */
export const categoryNotFound = (message = 'Category not found') =>
  new NotFoundException({ code: 'category-not-found', message });

/**
 * That a category exists, asked by whoever is about to point a row at it.
 * Products need it as much as categories do, so it is a function rather than a
 * method: a product write should not have to hold this service to check a
 * foreign key.
 */
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
 * The admin write model for categories — the tree the catalog hangs from.
 * Slugs are transliterated and kept unique here; reparenting is guarded against
 * cycles; deletion is a hard delete, guarded, because a category is structure
 * rather than content and a soft-deleted one would still hold its children.
 */
@Injectable()
export class AdminCategoriesService {
  constructor(@Inject(DRIZZLE) private db: NodePgDatabase<typeof schema>) {}

  async listCategories(): Promise<AdminCategory[]> {
    const rows = await this.db
      .select()
      .from(categories)
      .orderBy(asc(categories.sortOrder), asc(categories.name));

    const productCounts = await this.db
      .select({ categoryId: products.categoryId, value: count() })
      .from(products)
      .groupBy(products.categoryId);
    const childCounts = await this.db
      .select({ parentId: categories.parentId, value: count() })
      .from(categories)
      .groupBy(categories.parentId);

    const products_ = new Map(
      productCounts.map((r) => [r.categoryId, Number(r.value)]),
    );
    const children_ = new Map(
      childCounts
        .filter((r) => r.parentId)
        .map((r) => [r.parentId as string, Number(r.value)]),
    );

    return rows.map((r) =>
      toAdminCategory(r, products_.get(r.id) ?? 0, children_.get(r.id) ?? 0),
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
    // Place a new category after its current siblings.
    const sortOrder = await this.nextSortOrder(input.parentId);

    const row = await runUnique(() =>
      this.db
        .insert(categories)
        .values({
          sourceId: `manual:${randomUUID()}`,
          slug,
          name: input.name,
          shortName: input.shortName,
          parentId: input.parentId,
          sortOrder,
          image: input.image,
          description: input.description,
          updatedBy: actorId,
        })
        .returning(),
    );
    return toAdminCategory(row[0], 0, 0);
  }

  async updateCategory(
    id: string,
    input: CategoryInput,
    actorId: string,
  ): Promise<AdminCategory> {
    const existing = await this.categoryById(id);
    if (!existing) throw categoryNotFound();

    // PUT is a full replace, so parentId is always authoritative. Guard the
    // reparent against cycles before touching the row.
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

    const newSourceId = await resolveSourceIdOverride(
      this.db,
      categories,
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
          image: input.image,
          sourceId: newSourceId,
          description: input.description,
          updatedAt: new Date(),
          updatedBy: actorId,
        })
        .where(eq(categories.id, id)),
    );

    const [row] = await this.db
      .select()
      .from(categories)
      .where(eq(categories.id, id));
    const [{ value: productCount }] = await this.db
      .select({ value: count() })
      .from(products)
      .where(eq(products.categoryId, id));
    const [{ value: childCount }] = await this.db
      .select({ value: count() })
      .from(categories)
      .where(eq(categories.parentId, id));
    return toAdminCategory(row, Number(productCount), Number(childCount));
  }

  /**
   * Hard delete, guarded. Subcategories always block — the admin resolves the
   * subtree first; reassignment never merges child categories. Products
   * (including soft-deleted ones — the FK is `restrict` and does not
   * distinguish) block too, unless `reassignToId` is given: then every product
   * is moved to that category first, in one transaction with the delete, so a
   * populated category can be removed without orphaning anything.
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
      // No deletedAt filter: soft-deleted products carry the FK too, so they
      // must move as well or the delete would still fail.
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

  /** Guard a single reparent: walking up from the new parent must not reach the
   * moved node. A null parent (moving to root) can never cycle. */
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
  productCount: number,
  childCount: number,
): AdminCategory {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    parentId: row.parentId,
    sortOrder: row.sortOrder,
    image: row.image,
    sourceId: row.sourceId,
    description: row.description,
    shortName: row.shortName,
    productCount,
    childCount,
  };
}
