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
  inArray,
  isNull,
  ne,
  sql,
} from 'drizzle-orm';
import {
  AttributeDefinition,
  AttributeDefinitionInput,
  ReorderAttributesRequest,
  slugify,
} from '@b2b-catalog-platform/shared';
import { DRIZZLE } from '../db/database.module';
import * as schema from '../db/schema';
import {
  attributeDefinitions,
  productAttributes,
  products,
} from '../db/schema';

/** The one 404 this surface has; a function so each throw gets its own stack. */
const notFound = () =>
  new NotFoundException({
    code: 'attribute-not-found',
    message: 'Attribute definition not found',
  });

/** What the counts are taken over: the catalog as staff see it. */
type Usage = {
  productCount: number;
  valueCount: number;
  unparsedCount: number;
};

const NO_USAGE: Usage = { productCount: 0, valueCount: 0, unparsedCount: 0 };

/**
 * The filterable-attribute registry (FR-ATTR-01).
 *
 * A definition is metadata only: it names an attribute key staff already type
 * and says how its values are read and labelled. Nothing is stored against it
 * and nothing is derived from it — `product_attributes.valueNumeric` is parsed
 * on the row whatever this table says — so creating, retyping and deleting are
 * all plain metadata edits with nothing to rebuild and no delete guard.
 *
 * The counts each definition carries exist for one reason: matching is exact,
 * so a definition whose name is mistyped matches nothing, and the earliest
 * place that can be seen is this list.
 */
@Injectable()
export class AttributesService {
  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  /** The registry in filter-panel order, name as the tiebreak. */
  async listAttributes(): Promise<AttributeDefinition[]> {
    const rows = await this.db
      .select()
      .from(attributeDefinitions)
      .orderBy(
        asc(attributeDefinitions.sortOrder),
        asc(attributeDefinitions.name),
      );

    const usage = await this.usageFor(rows.map((r) => r.name));
    return rows.map((row) => this.toDefinition(row, usage.get(row.name)));
  }

  /** A new definition goes last: it is the one nobody has placed yet. */
  async createAttribute(
    input: AttributeDefinitionInput,
    actorId: string,
  ): Promise<AttributeDefinition> {
    await this.assertNameFree(input.name);
    const slug = await this.resolveNewSlug(input.slug, input.name);

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
        unit: input.unit || null,
        sortOrder: maxOrder + 1,
        updatedBy: actorId,
      })
      .returning();

    return this.toDefinition(created, await this.usageOf(created.name));
  }

  /**
   * Renaming a definition changes which key it matches, and that is the point:
   * it is how a definition is pointed at the spelling the products actually
   * carry. No product is touched — renaming the *attribute on the products* is
   * the inventory's rename, not this one.
   */
  async updateAttribute(
    id: string,
    input: AttributeDefinitionInput,
    actorId: string,
  ): Promise<AttributeDefinition> {
    const existing = await this.definitionById(id);
    if (!existing) throw notFound();

    if (input.name !== existing.name) await this.assertNameFree(input.name, id);
    const slug = await this.resolveSlugOverride(input.slug, existing.slug, id);

    const [updated] = await this.db
      .update(attributeDefinitions)
      .set({
        name: input.name,
        slug,
        type: input.type,
        unit: input.unit || null,
        updatedAt: new Date(),
        updatedBy: actorId,
      })
      .where(eq(attributeDefinitions.id, id))
      .returning();

    return this.toDefinition(updated, await this.usageOf(updated.name));
  }

  /**
   * Free, unlike deleting a tier: no row anywhere points at a definition, so
   * this only stops the attribute being filterable. The products keep their
   * attributes and the product page keeps showing them.
   */
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

  private async definitionById(id: string) {
    const [row] = await this.db
      .select()
      .from(attributeDefinitions)
      .where(eq(attributeDefinitions.id, id));
    return row;
  }

  /**
   * Usage per attribute key, in one grouped pass over the rows of the named
   * keys. Soft-deleted products are excluded — they are out of the catalog —
   * but unpublished ones are not: this is the admin's own view, and a
   * definition that only matches drafts still matches something.
   */
  private async usageFor(names: string[]): Promise<Map<string, Usage>> {
    if (names.length === 0) return new Map();

    const rows = await this.db
      .select({
        key: productAttributes.key,
        productCount: countDistinct(productAttributes.productId),
        valueCount: countDistinct(productAttributes.value),
        // Distinct values rather than rows: it is the facet's list that loses
        // them, and it reads against valueCount ("14 values, 2 not numbers").
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

  private async assertNameFree(name: string, exceptId?: string): Promise<void> {
    const [row] = await this.db
      .select({ id: attributeDefinitions.id })
      .from(attributeDefinitions)
      .where(
        exceptId
          ? and(
              eq(attributeDefinitions.name, name),
              ne(attributeDefinitions.id, exceptId),
            )
          : eq(attributeDefinitions.name, name),
      );
    if (row) {
      throw new ConflictException({
        code: 'attribute-name-taken',
        message: `Attribute '${name}' is already defined`,
      });
    }
  }

  /**
   * Same rule as products and categories: an admin-supplied slug is used as-is
   * (409 if taken), otherwise the name is transliterated and a numeric suffix
   * appended until it is free. `attribute` is the fallback stem for a name with
   * no slug-able characters.
   */
  private async resolveNewSlug(
    provided: string | undefined,
    name: string,
  ): Promise<string> {
    if (provided) {
      await this.assertSlugFree(provided);
      return provided;
    }
    const base = slugify(name) || 'attribute';
    let candidate = base;
    for (let i = 2; await this.slugTaken(candidate); i++) {
      candidate = `${base}-${i}`;
    }
    return candidate;
  }

  /**
   * Kept unless a new, free slug is given. Renaming an attribute deliberately
   * leaves the slug alone: it is what filtered listing URLs are written with,
   * and a rename must not break the links already shared.
   */
  private async resolveSlugOverride(
    provided: string | undefined,
    current: string,
    id: string,
  ): Promise<string> {
    if (!provided || provided === current) return current;
    await this.assertSlugFree(provided, id);
    return provided;
  }

  private async assertSlugFree(slug: string, exceptId?: string): Promise<void> {
    if (await this.slugTaken(slug, exceptId)) {
      throw new ConflictException({
        code: 'attribute-slug-taken',
        message: `Slug '${slug}' is already in use`,
      });
    }
  }

  private async slugTaken(slug: string, exceptId?: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: attributeDefinitions.id })
      .from(attributeDefinitions)
      .where(
        exceptId
          ? and(
              eq(attributeDefinitions.slug, slug),
              ne(attributeDefinitions.id, exceptId),
            )
          : eq(attributeDefinitions.slug, slug),
      )
      .limit(1);
    return !!row;
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
      valueCount: usage.valueCount,
      unparsedCount: usage.unparsedCount,
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
