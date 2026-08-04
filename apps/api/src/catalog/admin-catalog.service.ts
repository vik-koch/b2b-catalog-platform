import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import {
  and,
  asc,
  count,
  eq,
  inArray,
  isNotNull,
  isNull,
  sql,
} from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import {
  ADMIN_CATALOG_PAGE_SIZE,
  AdminCategory,
  AdminProductListQuery,
  AdminProduct,
  AdminProductListItem,
  CategoryInput,
  ProductInput,
  ReorderCategoriesRequest,
  slugify,
} from '@b2b-catalog-platform/shared';
import { sanitizeProductRichText } from '@b2b-catalog-platform/shared/node';
import { DRIZZLE } from '../db/database.module';
import * as schema from '../db/schema';
import { categories, products } from '../db/schema';
import { categoryBySlug, descendantIds } from './catalog-tree';
import {
  adminSearchCondition,
  parseSearchQuery,
  relevanceScore,
  setSearchThreshold,
} from './product-search';
import { adminProductOrderBy } from './product-sort';
import { ProductListItem } from '@b2b-catalog-platform/shared';

/** The editable product shape the admin contract returns. */
const adminProductColumns = {
  id: products.id,
  slug: products.slug,
  name: products.name,
  priceMinor: products.defaultPriceMinor,
  categoryId: products.categoryId,
  sourceId: products.sourceId,
  descriptionHtml: products.descriptionHtml,
  attributes: products.attributes,
  images: products.images,
  deletedAt: products.deletedAt,
  updatedAt: products.updatedAt,
} as const;

type ProductRow = {
  id: string;
  slug: string;
  name: string;
  priceMinor: number;
  categoryId: string;
  sourceId: string;
  descriptionHtml: string;
  attributes: { key: string; value: string }[];
  images: { full: string; thumb: string }[];
  deletedAt: Date | null;
  updatedAt: Date;
};

/**
 * The admin write model for the catalog — the counterpart to the read-only
 * `CatalogService`. Slugs are transliterated and kept unique here; descriptions
 * are sanitized here (the single write path, so nothing reaches the column
 * unsanitized); soft delete/restore flip `deletedAt`; category deletion is a
 * guarded hard delete. Storage split (ADR 0022) is preserved — this service
 * simply lets the admin edit every field.
 */
@Injectable()
export class AdminCatalogService {
  constructor(@Inject(DRIZZLE) private db: NodePgDatabase<typeof schema>) {}

  // --- Products -----------------------------------------------------------

  /**
   * The admin grid (FR-ADM-05): filtered by publication state and category,
   * searched by name or sync key, sorted. Unlike the storefront listing this
   * shows soft-deleted rows by default — `state` narrows, it does not widen.
   *
   * Runs in a transaction for the same reason the storefront search does: the
   * trigram threshold is set with `SET LOCAL`, so the matcher's recall cannot
   * depend on the server default. Not logged as a search (NFR-OPS-05) — the
   * search log measures what customers look for, and an admin looking up a row
   * they are about to edit would poison that.
   */
  async listProducts(query: AdminProductListQuery): Promise<{
    items: AdminProductListItem[];
    pagination: {
      page: number;
      pageSize: number;
      total: number;
      totalPages: number;
    };
  }> {
    const pageSize = ADMIN_CATALOG_PAGE_SIZE;
    const search = parseSearchQuery(query.q);
    const where = and(
      query.categoryId ? eq(products.categoryId, query.categoryId) : undefined,
      query.state === 'live' ? isNull(products.deletedAt) : undefined,
      query.state === 'deleted' ? isNotNull(products.deletedAt) : undefined,
      adminSearchCondition(query.q) ?? undefined,
    );
    // Only rank when the box holds something the name matcher could score; a
    // sync-key-only lookup has no meaningful relevance and falls back to name.
    const score = search ? relevanceScore(search) : undefined;

    return this.db.transaction(async (tx) => {
      await tx.execute(setSearchThreshold);

      const [{ value: total }] = await tx
        .select({ value: count() })
        .from(products)
        .where(where);

      const rows = await tx
        .select({
          slug: products.slug,
          name: products.name,
          priceMinor: products.defaultPriceMinor,
          categoryId: products.categoryId,
          sourceId: products.sourceId,
          images: products.images,
          deletedAt: products.deletedAt,
          updatedAt: products.updatedAt,
        })
        .from(products)
        .where(where)
        .orderBy(...adminProductOrderBy(query.sort, score))
        .limit(pageSize)
        .offset((query.page - 1) * pageSize);

      return {
        items: rows.map((r) => ({
          slug: r.slug,
          name: r.name,
          priceMinor: r.priceMinor,
          categoryId: r.categoryId,
          sourceId: r.sourceId,
          thumb: r.images[0]?.thumb ?? null,
          deletedAt: r.deletedAt?.toISOString() ?? null,
          updatedAt: r.updatedAt.toISOString(),
        })),
        pagination: {
          page: query.page,
          pageSize,
          total: Number(total),
          totalPages: Math.ceil(Number(total) / pageSize),
        },
      };
    });
  }

  /** Loads a product in editable form regardless of soft-delete state. */
  async getProduct(slug: string): Promise<AdminProduct | null> {
    const row = await this.productBySlug(slug);
    return row ? toAdminProduct(row) : null;
  }

  async createProduct(
    input: ProductInput,
    actorId: string,
  ): Promise<AdminProduct> {
    await this.ensureCategoryExists(input.categoryId);
    const slug = await this.resolveNewSlug(
      products,
      input.slug,
      input.name,
      'product',
    );
    const sourceId = await this.resolveSourceId(input.sourceId);

    const row = await this.runUnique(() =>
      this.db
        .insert(products)
        .values({
          sourceId,
          slug,
          name: input.name,
          defaultPriceMinor: input.priceMinor,
          categoryId: input.categoryId,
          descriptionHtml: sanitizeProductRichText(input.descriptionHtml),
          attributes: input.attributes,
          images: input.images,
          updatedBy: actorId,
        })
        .returning(adminProductColumns),
    );
    return toAdminProduct(row[0]);
  }

  async updateProduct(
    slug: string,
    input: ProductInput,
    actorId: string,
  ): Promise<AdminProduct> {
    const existing = await this.productBySlug(slug);
    if (!existing) throw new NotFoundException('Product not found');
    await this.ensureCategoryExists(input.categoryId);

    const newSlug = await this.resolveSlugOverride(
      products,
      input.slug,
      existing.slug,
    );
    const newSourceId = await this.resolveSourceIdOverride(
      input.sourceId,
      existing.sourceId,
    );

    const row = await this.runUnique(() =>
      this.db
        .update(products)
        .set({
          slug: newSlug,
          name: input.name,
          defaultPriceMinor: input.priceMinor,
          categoryId: input.categoryId,
          descriptionHtml: sanitizeProductRichText(input.descriptionHtml),
          attributes: input.attributes,
          images: input.images,
          sourceId: newSourceId,
          updatedAt: new Date(),
          updatedBy: actorId,
        })
        .where(eq(products.id, existing.id))
        .returning(adminProductColumns),
    );
    return toAdminProduct(row[0]);
  }

  /**
   * Soft delete: sets `deletedAt`, reversible via restore. Genuinely
   * idempotent — re-deleting an already-deleted product is a no-op that leaves
   * its original `deletedAt`/`updatedAt` untouched (coalesce keeps the first
   * timestamp; `updatedAt` only moves on the live→deleted transition).
   */
  async deleteProduct(slug: string, actorId: string): Promise<AdminProduct> {
    const now = new Date();
    const rows = await this.db
      .update(products)
      .set({
        deletedAt: sql`coalesce(${products.deletedAt}, ${now})`,
        updatedAt: sql`case when ${products.deletedAt} is null then ${now} else ${products.updatedAt} end`,
        // Attributed on the live->deleted transition only, so a repeat delete
        // does not rewrite who actually removed it.
        deletedBy: sql`case when ${products.deletedAt} is null then ${actorId}::uuid else ${products.deletedBy} end`,
      })
      .where(eq(products.slug, slug))
      .returning(adminProductColumns);
    if (!rows[0]) throw new NotFoundException('Product not found');
    return toAdminProduct(rows[0]);
  }

  async restoreProduct(slug: string, actorId: string): Promise<AdminProduct> {
    const rows = await this.db
      .update(products)
      .set({
        deletedAt: null,
        deletedBy: null,
        updatedAt: new Date(),
        updatedBy: actorId,
      })
      .where(eq(products.slug, slug))
      .returning(adminProductColumns);
    if (!rows[0]) throw new NotFoundException('Product not found');
    return toAdminProduct(rows[0]);
  }

  /**
   * The soft-deleted products in a category's subtree, in the public tile shape.
   * Aggregates over descendants exactly like the storefront grid (Pattern A), so
   * the edit-mode "Deleted" overlay is consistent with what the live grid shows.
   */
  async listDeletedProducts(slug: string): Promise<ProductListItem[]> {
    const rows = await this.db
      .select({
        id: categories.id,
        slug: categories.slug,
        name: categories.name,
        shortName: categories.shortName,
        parentId: categories.parentId,
        image: categories.image,
        sortOrder: categories.sortOrder,
      })
      .from(categories);
    const category = categoryBySlug(rows, slug);
    if (!category) throw new NotFoundException('Category not found');

    const ids = descendantIds(category.id, rows);
    return this.db
      .select({
        slug: products.slug,
        name: products.name,
        priceMinor: products.defaultPriceMinor,
        images: products.images,
      })
      .from(products)
      .where(
        and(inArray(products.categoryId, ids), isNotNull(products.deletedAt)),
      )
      .orderBy(asc(products.name));
  }

  // --- Categories ---------------------------------------------------------

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
    if (input.parentId) await this.ensureCategoryExists(input.parentId);
    const slug = await this.resolveNewSlug(
      categories,
      input.slug,
      input.name,
      'category',
    );
    // Place a new category after its current siblings.
    const sortOrder = await this.nextSortOrder(input.parentId);

    const row = await this.runUnique(() =>
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
    if (!existing) throw new NotFoundException('Category not found');

    // PUT is a full replace, so parentId is always authoritative. Guard the
    // reparent against cycles before touching the row.
    if (input.parentId !== existing.parentId) {
      if (input.parentId) await this.ensureCategoryExists(input.parentId);
      await this.assertNoReparentCycle(id, input.parentId);
    }
    const newSlug = await this.resolveSlugOverride(
      categories,
      input.slug,
      existing.slug,
    );

    const newSourceId = await this.resolveSourceIdOverride(
      input.sourceId,
      existing.sourceId,
    );

    await this.runUnique(() =>
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
    if (!existing) throw new NotFoundException('Category not found');

    const [{ value: childCount }] = await this.db
      .select({ value: count() })
      .from(categories)
      .where(eq(categories.parentId, id));
    if (Number(childCount) > 0) {
      throw new ConflictException('Category still has subcategories');
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
      throw new ConflictException('Category still has products');
    }
    if (reassignToId === id) {
      throw new ConflictException('Cannot reassign a category to itself');
    }
    const target = await this.categoryById(reassignToId);
    if (!target) throw new NotFoundException('Target category not found');

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
        throw new NotFoundException(`Unknown category ${entry.id}`);
      }
      if (entry.parentId !== null && !known.has(entry.parentId)) {
        throw new NotFoundException(`Unknown parent ${entry.parentId}`);
      }
      parentById.set(entry.id, entry.parentId);
    }
    if (hasCycle(parentById)) {
      throw new ConflictException('Reorder would create a category cycle');
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

  // --- Helpers ------------------------------------------------------------

  private async productBySlug(slug: string): Promise<ProductRow | undefined> {
    const [row] = await this.db
      .select(adminProductColumns)
      .from(products)
      .where(eq(products.slug, slug))
      .limit(1);
    return row;
  }

  private async categoryById(id: string) {
    const [row] = await this.db
      .select()
      .from(categories)
      .where(eq(categories.id, id))
      .limit(1);
    return row;
  }

  private async ensureCategoryExists(id: string): Promise<void> {
    const [row] = await this.db
      .select({ id: categories.id })
      .from(categories)
      .where(eq(categories.id, id))
      .limit(1);
    if (!row) throw new NotFoundException('Category not found');
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

  /**
   * Resolve a slug on create: an admin-supplied slug is used as-is (409 if
   * taken), otherwise the name is transliterated and a numeric suffix appended
   * until unique. Falls back to `stem` when the name has no slug-able chars.
   */
  private async resolveNewSlug(
    table: typeof products | typeof categories,
    provided: string | undefined,
    name: string,
    stem: string,
  ): Promise<string> {
    if (provided) {
      if (await this.slugExists(table, provided)) {
        throw new ConflictException(`Slug '${provided}' is already in use`);
      }
      return provided;
    }
    const base = slugify(name) || stem;
    let candidate = base;
    for (let i = 2; await this.slugExists(table, candidate); i++) {
      candidate = `${base}-${i}`;
    }
    return candidate;
  }

  /** Resolve a slug on update: keep the old one unless a new, free slug is given. */
  private async resolveSlugOverride(
    table: typeof products | typeof categories,
    provided: string | undefined,
    current: string,
  ): Promise<string> {
    if (!provided || provided === current) return current;
    if (await this.slugExists(table, provided)) {
      throw new ConflictException(`Slug '${provided}' is already in use`);
    }
    return provided;
  }

  private async slugExists(
    table: typeof products | typeof categories,
    slug: string,
  ): Promise<boolean> {
    const [row] = await this.db
      .select({ slug: table.slug })
      .from(table)
      .where(eq(table.slug, slug))
      .limit(1);
    return !!row;
  }

  private async resolveSourceId(provided: string | undefined): Promise<string> {
    if (!provided) return `manual:${randomUUID()}`;
    if (await this.sourceIdExists(provided)) {
      throw new ConflictException(`Source id '${provided}' is already in use`);
    }
    return provided;
  }

  private async resolveSourceIdOverride(
    provided: string | undefined,
    current: string,
  ): Promise<string> {
    if (!provided || provided === current) return current;
    if (await this.sourceIdExists(provided)) {
      throw new ConflictException(`Source id '${provided}' is already in use`);
    }
    return provided;
  }

  private async sourceIdExists(sourceId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: products.id })
      .from(products)
      .where(eq(products.sourceId, sourceId))
      .limit(1);
    return !!row;
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
      throw new ConflictException('Move would create a category cycle');
    }
  }

  /**
   * Run a write and translate a unique-violation (race with a concurrent admin,
   * past our pre-checks) into a 409 rather than a 500.
   */
  private async runUnique<T>(op: () => Promise<T>): Promise<T> {
    try {
      return await op();
    } catch (e) {
      if (
        typeof e === 'object' &&
        e !== null &&
        (e as { code?: string }).code === '23505'
      ) {
        throw new ConflictException('A slug or source id conflict occurred');
      }
      throw e;
    }
  }
}

function toAdminProduct(row: ProductRow): AdminProduct {
  return {
    slug: row.slug,
    name: row.name,
    priceMinor: row.priceMinor,
    categoryId: row.categoryId,
    sourceId: row.sourceId,
    descriptionHtml: row.descriptionHtml,
    attributes: row.attributes,
    images: row.images,
    deletedAt: row.deletedAt?.toISOString() ?? null,
    updatedAt: row.updatedAt.toISOString(),
  };
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

/** True if the parent map contains a cycle (walking up from any node loops). */
function hasCycle(parentById: Map<string, string | null>): boolean {
  for (const start of parentById.keys()) {
    const seen = new Set<string>();
    let current: string | null | undefined = start;
    while (current) {
      if (seen.has(current)) return true;
      seen.add(current);
      current = parentById.get(current) ?? null;
    }
  }
  return false;
}
