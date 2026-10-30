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
  countDistinct,
  eq,
  gt,
  inArray,
  isNull,
  sql,
} from 'drizzle-orm';
import { parseAttributeNumber } from '@b2b-catalog-platform/shared/core/catalog';
import {
  AttributeDefinition,
  AttributeDefinitionInput,
  CatalogFilters,
  CategoryFilters,
  CategoryFilterSource,
  SaveCategoryFiltersRequest,
  AttributeKeyUsage,
  AttributeValueUsage,
  RenameAttributeKeyRequest,
  RenameAttributeValueRequest,
  ReorderAttributesRequest,
} from '@b2b-catalog-platform/shared/admin/catalog';
import { DRIZZLE } from '../../../db/database.module';
import * as schema from '../../../db/schema';
import {
  attributeDefinitions,
  catalogAttributes,
  categoryAttributes,
  productAttributes,
  products,
} from '../../../db/schema';
import {
  categoryChain,
  DefinitionRow,
} from '../../../core/catalog/category-filters';
import {
  categoryBySlug,
  CategoryRow,
  descendantIds,
} from '../../../core/catalog/catalog-tree';
import { CatalogReader } from '../../../core/catalog/catalog-reader';
import { categoryNotFound } from '../categories/categories.service';
import { resolveNewSlug, resolveSlugOverride } from '../catalog-identity';

/** The one 404 this surface has; a function so each throw gets its own stack. */
const notFound = () =>
  new NotFoundException({
    code: 'attribute-not-found',
    message: 'Attribute definition not found',
  });

const attributeSlugTaken = (slug: string) =>
  new ConflictException({
    code: 'attribute-slug-taken',
    message: `Slug '${slug}' is already in use`,
  });

/** Products in the catalog carrying the grouped text, and deleted ones. */
const liveProducts = sql<number>`count(distinct ${productAttributes.productId})
  filter (where ${products.deletedAt} is null)`.mapWith(Number);
const deletedProducts =
  sql<number>`count(distinct ${productAttributes.productId})
  filter (where ${products.deletedAt} is not null)`.mapWith(Number);
/** Of the catalog's, the ones not on the storefront. */
const unpublishedProducts =
  sql<number>`count(distinct ${productAttributes.productId})
  filter (where ${products.deletedAt} is null
    and ${products.publishedAt} is null)`.mapWith(Number);

/** What the counts are taken over: the catalog as staff see it. */
type Usage = {
  productCount: number;
  unpublishedProductCount: number;
  valueCount: number;
  unparsedCount: number;
};

/** A filter row's counts: the products under it carrying the key. */
type ProductCounts = Pick<Usage, 'productCount' | 'unpublishedProductCount'>;

const NO_PRODUCTS: ProductCounts = {
  productCount: 0,
  unpublishedProductCount: 0,
};

const NO_USAGE: Usage = {
  productCount: 0,
  unpublishedProductCount: 0,
  valueCount: 0,
  unparsedCount: 0,
};

/** A stored panel row: its place, and whether it is offered. */
type PanelRow = { sortOrder: number; hidden: boolean };

/**
 * A filter editor's rows: every definition, the placed ones in panel order and
 * the rest after them in registry order. `offered` and `isNew` read a
 * definition's row, absent where the panel does not place it.
 */
function panelFilters(
  definitions: DefinitionRow[],
  placed: Map<string, PanelRow>,
  counts: Map<string, ProductCounts>,
  rules: {
    offered: (row?: PanelRow) => boolean;
    isNew: (row?: PanelRow) => boolean;
  },
) {
  return definitions
    .map((definition, index) => {
      const row = placed.get(definition.id);
      return {
        attributeId: definition.id,
        name: definition.name,
        slug: definition.slug,
        type: definition.type,
        unit: definition.unit,
        visible: rules.offered(row),
        ...(counts.get(definition.name) ?? NO_PRODUCTS),
        isNew: rules.isNew(row),
        rank: row ? row.sortOrder : Number.MAX_SAFE_INTEGER - index,
      };
    })
    .sort((a, b) => a.rank - b.rank)
    .map(({ rank: _rank, ...filter }) => filter);
}

/** Only a `number` attribute keeps a unit: "Blue cm" means nothing. Dropped
 * rather than refused, as retyping silently changes what values mean. */
function unitFor(input: AttributeDefinitionInput): string | null {
  return input.type === 'number' ? input.unit || null : null;
}

/** Attribute text as the `numeric` column takes it: a string, or null. */
function numericColumnValue(value: string): string | null {
  const parsed = parseAttributeNumber(value);
  return parsed === null ? null : String(parsed);
}

/**
 * The filterable-attribute registry (FR-ATTR-01), its inventory of keys in use
 * (FR-ATTR-09) and the filter panels (FR-ATTR-11/12). A definition is metadata
 * only: nothing is stored against it, so every edit is plain, with nothing to
 * rebuild and no delete guard.
 *
 * Every count here is over the catalog, live and unpublished, never deleted
 * products (FR-ADM-22), so a count agrees with the grid it leads to.
 */
@Injectable()
export class AttributesService {
  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof schema>,
    private readonly reader: CatalogReader,
  ) {}

  /** The registry in filter-panel order. */
  async listAttributes(): Promise<AttributeDefinition[]> {
    const rows = await this.reader.attributeDefinitions();

    const usage = await this.usageFor(rows.map((r) => r.name));
    return rows.map((row) => this.toDefinition(row, usage.get(row.name)));
  }

  /** A new definition goes last: it is the one nobody has placed yet. */
  async createAttribute(
    input: AttributeDefinitionInput,
    actorId: string,
  ): Promise<AttributeDefinition> {
    await this.assertNameFree(input.name);
    const slug = await resolveNewSlug(
      this.db,
      attributeDefinitions,
      input.slug,
      input.name,
      'attribute',
      attributeSlugTaken,
    );

    const [{ value: maxOrder }] = await this.db
      .select({
        value:
          sql<number>`coalesce(max(${attributeDefinitions.sortOrder}), -1)`.mapWith(
            Number,
          ),
      })
      .from(attributeDefinitions);

    const [created] = await this.db
      .insert(attributeDefinitions)
      .values({
        name: input.name,
        slug,
        type: input.type,
        unit: unitFor(input),
        sortOrder: maxOrder + 1,
        updatedBy: actorId,
      })
      .returning();

    return this.toDefinition(created, await this.usageOf(created.name));
  }

  /**
   * Renaming a definition points it at another key; no product is touched,
   * that is the inventory's rename. The slug stays unless a new one is given:
   * shared filtered links are written with it.
   */
  async updateAttribute(
    id: string,
    input: AttributeDefinitionInput,
    actorId: string,
  ): Promise<AttributeDefinition> {
    const existing = await this.definitionById(id);
    if (!existing) throw notFound();

    if (input.name !== existing.name) await this.assertNameFree(input.name);
    const slug = await resolveSlugOverride(
      this.db,
      attributeDefinitions,
      input.slug,
      existing.slug,
      attributeSlugTaken,
    );

    const [updated] = await this.db
      .update(attributeDefinitions)
      .set({
        name: input.name,
        slug,
        type: input.type,
        unit: unitFor(input),
        updatedAt: new Date(),
        updatedBy: actorId,
      })
      .where(eq(attributeDefinitions.id, id))
      .returning();

    return this.toDefinition(updated, await this.usageOf(updated.name));
  }

  /** Only stops the attribute being filterable: no row points at a
   * definition, and products keep their attributes. */
  async deleteAttribute(id: string): Promise<{ message: string }> {
    const existing = await this.definitionById(id);
    if (!existing) throw notFound();

    await this.db
      .delete(attributeDefinitions)
      .where(eq(attributeDefinitions.id, id));
    return { message: 'Attribute definition deleted' };
  }

  /** Applies a whole filter-panel order in one transaction. */
  async reorderAttributes(
    request: ReorderAttributesRequest,
    actorId: string,
  ): Promise<AttributeDefinition[]> {
    const ids = request.order.map((entry) => entry.id);
    if (ids.length > 0) {
      const rows = await this.db
        .select({ id: attributeDefinitions.id })
        .from(attributeDefinitions)
        .where(inArray(attributeDefinitions.id, ids));
      if (rows.length !== new Set(ids).size) throw notFound();
    }

    await this.db.transaction(async (tx) => {
      for (const entry of request.order) {
        await tx
          .update(attributeDefinitions)
          .set({ sortOrder: entry.sortOrder, updatedBy: actorId })
          .where(eq(attributeDefinitions.id, entry.id));
      }
    });

    return this.listAttributes();
  }

  /** Every key in use, declared or not (FR-ATTR-09), alphabetically, which
   * puts a typo next to its correct spelling. */
  async listAttributeKeys(): Promise<AttributeKeyUsage[]> {
    const [rows, definitions] = await Promise.all([
      this.db
        .select({
          key: productAttributes.key,
          productCount: liveProducts,
          unpublishedProductCount: unpublishedProducts,
          valueCount: sql<number>`count(distinct ${productAttributes.value})
            filter (where ${products.deletedAt} is null)`.mapWith(Number),
          deletedProductCount: deletedProducts,
        })
        .from(productAttributes)
        .innerJoin(products, eq(products.id, productAttributes.productId))
        .groupBy(productAttributes.key)
        // A key only deleted products carry is out of the catalog with them.
        .having(gt(liveProducts, 0))
        .orderBy(asc(productAttributes.key)),
      this.db
        .select({
          id: attributeDefinitions.id,
          name: attributeDefinitions.name,
          type: attributeDefinitions.type,
        })
        .from(attributeDefinitions),
    ]);

    const declared = new Map(
      definitions.map(({ name, ...definition }) => [name, definition]),
    );
    return rows.map((row) => ({
      ...row,
      definition: declared.get(row.key) ?? null,
    }));
  }

  /** The values one key carries: numbers first in numeric order, then the
   * rest alphabetically. */
  async listAttributeValues(key: string): Promise<AttributeValueUsage[]> {
    const rows = await this.db
      .select({
        value: productAttributes.value,
        productCount: liveProducts,
        unpublishedProductCount: unpublishedProducts,
        deletedProductCount: deletedProducts,
        numeric: sql<boolean>`bool_or(${productAttributes.valueNumeric} is not null)`,
        // One numeric form per group; max() carries it into the ordering.
        sortValue: sql<string | null>`max(${productAttributes.valueNumeric})`,
      })
      .from(productAttributes)
      .innerJoin(products, eq(products.id, productAttributes.productId))
      .where(eq(productAttributes.key, key))
      .groupBy(productAttributes.value)
      .having(gt(liveProducts, 0))
      .orderBy(
        sql`max(${productAttributes.valueNumeric}) asc nulls last`,
        asc(productAttributes.value),
      );

    return rows.map(({ sortValue: _sortValue, ...usage }) => usage);
  }

  /**
   * Renames a key on every product carrying it; onto a key in use, the two
   * merge. Deleted products are rewritten too, so a restored one does not
   * bring back the old spelling (FR-ADM-22).
   */
  async renameAttributeKey(
    request: RenameAttributeKeyRequest,
  ): Promise<{ updated: number }> {
    if (request.from === request.to) return { updated: 0 };

    const updated = await this.db
      .update(productAttributes)
      .set({ key: request.to })
      .where(eq(productAttributes.key, request.from))
      .returning({ productId: productAttributes.productId });

    return { updated: updated.length };
  }

  /**
   * Renames one value under one key. The numeric form is parsed again, so
   * correcting "ca. 30" to "30" puts the product back into a number filter.
   */
  async renameAttributeValue(
    request: RenameAttributeValueRequest,
  ): Promise<{ updated: number }> {
    if (request.from === request.to) return { updated: 0 };

    const updated = await this.db
      .update(productAttributes)
      .set({
        value: request.to,
        valueNumeric: numericColumnValue(request.to),
      })
      .where(
        and(
          eq(productAttributes.key, request.key),
          eq(productAttributes.value, request.from),
        ),
      )
      .returning({ productId: productAttributes.productId });

    return { updated: updated.length };
  }

  /**
   * One category's filter panel as the editor reads it (FR-ATTR-11). The counts
   * cover the category and its subcategories, the facets' own scope, so a zero
   * means no facet would render there.
   */
  async getCategoryFilters(slug: string): Promise<CategoryFilters> {
    const { rows, category } = await this.categoryAt(slug);

    const chain = categoryChain(category.id, rows);
    const [definitions, overlay, counts] = await Promise.all([
      this.reader.attributeDefinitions(),
      this.db
        .select()
        .from(categoryAttributes)
        .where(inArray(categoryAttributes.categoryId, chain)),
      this.countsInScope(descendantIds(category.id, rows)),
    ]);

    const owner = chain.find((id) =>
      overlay.some((row) => row.categoryId === id),
    );
    const source: CategoryFilterSource = !owner
      ? 'default'
      : owner === category.id
        ? 'own'
        : 'inherited';
    const from =
      owner && owner !== category.id
        ? rows.find((row) => row.id === owner)
        : undefined;

    const applied = new Map(
      overlay
        .filter((row) => row.categoryId === owner)
        .map((row) => [row.attributeId, row]),
    );
    // Without an overlay everything is offered and nothing was left out.
    const filters = panelFilters(definitions, applied, counts, {
      offered: (row) => (owner ? !!row && !row.hidden : true),
      isNew: (row) => !!owner && !row,
    });

    return {
      category: { id: category.id, slug: category.slug, name: category.name },
      source,
      inheritedFrom: from ? { slug: from.slug, name: from.name } : null,
      filters,
    };
  }

  /** Replaces a category's overlay wholesale, in the order posted. */
  async saveCategoryFilters(
    slug: string,
    request: SaveCategoryFiltersRequest,
  ): Promise<CategoryFilters> {
    const { category } = await this.categoryAt(slug);

    await this.assertDefinitions(request);

    await this.db.transaction(async (tx) => {
      await tx
        .delete(categoryAttributes)
        .where(eq(categoryAttributes.categoryId, category.id));
      if (request.filters.length === 0) return;
      await tx.insert(categoryAttributes).values(
        request.filters.map((filter, index) => ({
          categoryId: category.id,
          attributeId: filter.attributeId,
          sortOrder: index,
          hidden: !filter.visible,
        })),
      );
    });

    return this.getCategoryFilters(slug);
  }

  /** Drops the overlay, so the category inherits again. */
  async resetCategoryFilters(slug: string): Promise<CategoryFilters> {
    const { category } = await this.categoryAt(slug);

    await this.db
      .delete(categoryAttributes)
      .where(eq(categoryAttributes.categoryId, category.id));
    return this.getCategoryFilters(slug);
  }

  /** The whole-catalogue panel (FR-ATTR-12): no inheritance, so a row-less
   * attribute is simply not offered. The counts cover every product. */
  async getCatalogFilters(): Promise<CatalogFilters> {
    const [definitions, rows, counts] = await Promise.all([
      this.reader.attributeDefinitions(),
      this.db.select().from(catalogAttributes),
      this.countsInScope(null),
    ]);
    const placed = new Map(rows.map((row) => [row.attributeId, row]));
    const filters = panelFilters(definitions, placed, counts, {
      offered: (row) => !!row && !row.hidden,
      isNew: () => false,
    });
    return { filters };
  }

  /** The whole-catalogue panel, written wholesale like a category's. */
  async saveCatalogFilters(
    request: SaveCategoryFiltersRequest,
  ): Promise<CatalogFilters> {
    await this.assertDefinitions(request);
    await this.db.transaction(async (tx) => {
      await tx.delete(catalogAttributes);
      if (request.filters.length === 0) return;
      await tx.insert(catalogAttributes).values(
        request.filters.map((filter, index) => ({
          attributeId: filter.attributeId,
          sortOrder: index,
          hidden: !filter.visible,
        })),
      );
    });
    return this.getCatalogFilters();
  }

  /** Refuses a panel naming a definition that has since been deleted. */
  private async assertDefinitions(
    request: SaveCategoryFiltersRequest,
  ): Promise<void> {
    const ids = request.filters.map((filter) => filter.attributeId);
    if (ids.length === 0) return;
    const known = await this.db
      .select({ id: attributeDefinitions.id })
      .from(attributeDefinitions)
      .where(inArray(attributeDefinitions.id, ids));
    if (known.length !== new Set(ids).size) throw notFound();
  }

  /** The category a panel path names, with the rows its chain is read from. */
  private async categoryAt(
    slug: string,
  ): Promise<{ rows: CategoryRow[]; category: CategoryRow }> {
    const rows = await this.reader.categoryRows();
    const category = categoryBySlug(rows, slug);
    if (!category) throw categoryNotFound();
    return { rows, category };
  }

  /** Products per attribute key within a set of categories — or across the
   * whole catalogue, for `null` — and how many of them are unpublished. */
  private async countsInScope(
    categoryIds: string[] | null,
  ): Promise<Map<string, ProductCounts>> {
    if (categoryIds?.length === 0) return new Map();
    const rows = await this.db
      .select({
        key: productAttributes.key,
        productCount: countDistinct(productAttributes.productId),
        unpublishedProductCount: unpublishedProducts,
      })
      .from(productAttributes)
      .innerJoin(products, eq(products.id, productAttributes.productId))
      .where(
        and(
          isNull(products.deletedAt),
          categoryIds ? inArray(products.categoryId, categoryIds) : undefined,
        ),
      )
      .groupBy(productAttributes.key);
    return new Map(
      rows.map(({ key, ...counts }): [string, ProductCounts] => [key, counts]),
    );
  }

  private async definitionById(id: string) {
    const [row] = await this.db
      .select()
      .from(attributeDefinitions)
      .where(eq(attributeDefinitions.id, id));
    return row;
  }

  /** Usage per attribute key, in one grouped pass. The storefront's facet
   * counts differ on purpose: they count what a visitor can reach. */
  private async usageFor(names: string[]): Promise<Map<string, Usage>> {
    if (names.length === 0) return new Map();

    const rows = await this.db
      .select({
        key: productAttributes.key,
        productCount: countDistinct(productAttributes.productId),
        unpublishedProductCount:
          sql<number>`count(distinct ${productAttributes.productId})
          filter (where ${products.publishedAt} is null)`.mapWith(Number),
        valueCount: countDistinct(productAttributes.value),
        // Distinct values, read against valueCount ("14 values, 2 not
        // numbers").
        unparsedCount: sql<number>`count(distinct ${productAttributes.value})
          filter (where ${productAttributes.valueNumeric} is null)`.mapWith(
          Number,
        ),
      })
      .from(productAttributes)
      .innerJoin(products, eq(products.id, productAttributes.productId))
      .where(
        and(inArray(productAttributes.key, names), isNull(products.deletedAt)),
      )
      .groupBy(productAttributes.key);

    return new Map(rows.map(({ key, ...usage }) => [key, usage]));
  }

  private async usageOf(name: string): Promise<Usage> {
    return (await this.usageFor([name])).get(name) ?? NO_USAGE;
  }

  private async assertNameFree(name: string): Promise<void> {
    const [row] = await this.db
      .select({ id: attributeDefinitions.id })
      .from(attributeDefinitions)
      .where(eq(attributeDefinitions.name, name));
    if (row) {
      throw new ConflictException({
        code: 'attribute-name-taken',
        message: `Attribute '${name}' is already defined`,
      });
    }
  }

  private toDefinition(
    row: typeof attributeDefinitions.$inferSelect,
    usage: Usage = NO_USAGE,
  ): AttributeDefinition {
    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      type: row.type,
      unit: row.unit,
      sortOrder: row.sortOrder,
      productCount: usage.productCount,
      unpublishedProductCount: usage.unpublishedProductCount,
      valueCount: usage.valueCount,
      unparsedCount: usage.unparsedCount,
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
