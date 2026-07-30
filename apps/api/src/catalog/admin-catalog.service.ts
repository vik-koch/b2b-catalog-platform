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
  ADMIN_CATALOG_PAGE_SIZE,
  AdminCategory,
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
import {
  categories,
  products,
  ProductAttribute,
  ProductImageRef,
} from '../db/schema';

// The API project compiles with strictNullChecks off, under which zod widens
// every object property to optional (its inference marks any key whose type
// admits undefined). So `ProductInput.attributes`/`images` come through as
// `{ key?; value? }[]` / `{ full?; thumb? }[]`, structurally identical to the
// drizzle column types but not assignable. The `as` casts at the insert/update
// sites below bridge that gap; the values are already zod-validated at the
// contract edge, so every property is in fact present.

/** The editable product shape the admin contract returns. */
const adminProductColumns = {
  id: products.id,
  slug: products.slug,
  name: products.name,
  priceMinor: products.priceMinor,
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

  async listProducts(query: { page: number; categoryId?: string }): Promise<{
    items: AdminProductListItem[];
    pagination: {
      page: number;
      pageSize: number;
      total: number;
      totalPages: number;
    };
  }> {
    const pageSize = ADMIN_CATALOG_PAGE_SIZE;
    const where = query.categoryId
      ? eq(products.categoryId, query.categoryId)
      : undefined;

    const [{ value: total }] = await this.db
      .select({ value: count() })
      .from(products)
      .where(where);

    const rows = await this.db
      .select({
        slug: products.slug,
        name: products.name,
        priceMinor: products.priceMinor,
        categoryId: products.categoryId,
        images: products.images,
        deletedAt: products.deletedAt,
      })
      .from(products)
      .where(where)
      .orderBy(asc(products.name))
      .limit(pageSize)
      .offset((query.page - 1) * pageSize);

    return {
      items: rows.map((r) => ({
        slug: r.slug,
        name: r.name,
        priceMinor: r.priceMinor,
        categoryId: r.categoryId,
        thumb: r.images[0]?.thumb ?? null,
        deletedAt: r.deletedAt?.toISOString() ?? null,
      })),
      pagination: {
        page: query.page,
        pageSize,
        total: Number(total),
        totalPages: Math.ceil(Number(total) / pageSize),
      },
    };
  }

  /** Loads a product in editable form regardless of soft-delete state. */
  async getProduct(slug: string): Promise<AdminProduct | null> {
    const row = await this.productBySlug(slug);
    return row ? toAdminProduct(row) : null;
  }

  async createProduct(input: ProductInput): Promise<AdminProduct> {
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
          priceMinor: input.priceMinor,
          categoryId: input.categoryId,
          descriptionHtml: sanitizeProductRichText(input.descriptionHtml),
          attributes: input.attributes as ProductAttribute[],
          images: input.images as ProductImageRef[],
        })
        .returning(adminProductColumns),
    );
    return toAdminProduct(row[0]);
  }

  async updateProduct(
    slug: string,
    input: ProductInput,
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
          priceMinor: input.priceMinor,
          categoryId: input.categoryId,
          descriptionHtml: sanitizeProductRichText(input.descriptionHtml),
          attributes: input.attributes as ProductAttribute[],
          images: input.images as ProductImageRef[],
          sourceId: newSourceId,
          updatedAt: new Date(),
        })
        .where(eq(products.id, existing.id))
        .returning(adminProductColumns),
    );
    return toAdminProduct(row[0]);
  }

  /** Soft delete: sets `deletedAt`, reversible via restore. Idempotent. */
  async deleteProduct(slug: string): Promise<AdminProduct> {
    const now = new Date();
    const rows = await this.db
      .update(products)
      .set({ deletedAt: now, updatedAt: now })
      .where(eq(products.slug, slug))
      .returning(adminProductColumns);
    if (!rows[0]) throw new NotFoundException('Product not found');
    return toAdminProduct(rows[0]);
  }

  async restoreProduct(slug: string): Promise<AdminProduct> {
    const rows = await this.db
      .update(products)
      .set({ deletedAt: null, updatedAt: new Date() })
      .where(eq(products.slug, slug))
      .returning(adminProductColumns);
    if (!rows[0]) throw new NotFoundException('Product not found');
    return toAdminProduct(rows[0]);
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

  async createCategory(input: CategoryInput): Promise<AdminCategory> {
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
          sourceKey: `manual:${randomUUID()}`,
          slug,
          name: input.name,
          parentId: input.parentId,
          sortOrder,
          image: input.image as ProductImageRef | null,
          description: input.description,
        })
        .returning(),
    );
    return toAdminCategory(row[0], 0, 0);
  }

  async updateCategory(
    id: string,
    input: CategoryInput,
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

    await this.runUnique(() =>
      this.db
        .update(categories)
        .set({
          name: input.name,
          slug: newSlug,
          parentId: input.parentId,
          image: input.image as ProductImageRef | null,
          description: input.description,
          updatedAt: new Date(),
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
    description: row.description,
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
