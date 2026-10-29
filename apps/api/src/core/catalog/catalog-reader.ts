import { Inject, Injectable } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { and, asc, eq, gte, isNull, or, SQL } from 'drizzle-orm';
import {
  joinAttributeKey,
  ProductDetail,
  ProductDetailAttribute,
  PublicDocument,
  publicDocumentSchema,
} from '@b2b-catalog-platform/shared/core/catalog';
import { isoToday } from '@b2b-catalog-platform/shared/platform';
import { effectiveTaxRate, TaxConfig } from '@b2b-catalog-platform/shared';
import { TAX_CONFIG } from '../../config/deployment-config';
import { DRIZZLE } from '../../db/database.module';
import * as schema from '../../db/schema';
import {
  attributeDefinitions,
  categories,
  categoryAttributes,
  documentProducts,
  documents,
  orderItems,
  productAttributes,
  products,
} from '../../db/schema';
import { ancestorsOf, CategoryRow } from './catalog-tree';
import {
  categoryChain,
  DefinitionRow,
  resolveCategoryDefinitions,
} from './category-filters';
import { livePriceMinor } from './product-price';
import { pairedCountOf } from './product-pairings';
import {
  availabilityColumns,
  boxDimensionsOf,
  packagingOf,
  partsColumns,
  pictureColumns,
  picturesOf,
  unitColumns,
  unitPricesOf,
} from './product-view';

/**
 * The catalog reads both audiences make: the category rows, a category's
 * filter panel, and a product as its page shows it. The storefront reads a
 * product under its visibility, the admin's preview under none.
 */
@Injectable()
export class CatalogReader {
  constructor(
    @Inject(DRIZZLE) private db: NodePgDatabase<typeof schema>,
    @Inject(TAX_CONFIG) private readonly tax: TaxConfig,
  ) {}

  categoryRows(): Promise<CategoryRow[]> {
    return this.db
      .select({
        id: categories.id,
        slug: categories.slug,
        name: categories.name,
        shortName: categories.shortName,
        parentId: categories.parentId,
        mark: categories.mark,
        sortOrder: categories.sortOrder,
      })
      .from(categories)
      .orderBy(asc(categories.sortOrder), asc(categories.name));
  }

  /**
   * The filterable-attribute registry in panel order (FR-ATTR-01). Read on
   * every listing: it is a handful of rows, and it is what turns a URL slug
   * into the attribute key products actually carry.
   */
  attributeDefinitions() {
    return this.db
      .select()
      .from(attributeDefinitions)
      .orderBy(
        asc(attributeDefinitions.sortOrder),
        asc(attributeDefinitions.name),
      );
  }

  /**
   * The filterable attributes one category offers, in its own order
   * (FR-ATTR-11) — the registry unless the category or an ancestor overlays
   * it. See category-filters.ts.
   */
  private async categoryDefinitions(
    categoryId: string,
    rows: CategoryRow[],
  ): Promise<DefinitionRow[]> {
    return (await this.categoryPanels(rows))(categoryId);
  }

  /** Any category's panel, from one read of the registry and the overlays —
   * a listing asks it for itself and for each of its chips. */
  async categoryPanels(
    rows: CategoryRow[],
  ): Promise<(categoryId: string) => DefinitionRow[]> {
    const [definitions, overlay] = await Promise.all([
      this.attributeDefinitions(),
      this.db.select().from(categoryAttributes),
    ]);
    return (categoryId) =>
      resolveCategoryDefinitions(
        categoryChain(categoryId, rows),
        definitions,
        overlay,
      );
  }

  /** One product's page, under whatever visibility the caller asks for. */
  async readProduct(
    slug: string,
    tierId: string | null,
    visibility: SQL | undefined,
  ) {
    const [product] = await this.db
      .select({
        id: products.id,
        slug: products.slug,
        name: products.name,
        priceMinor: livePriceMinor(tierId),
        descriptionHtml: products.descriptionHtml,
        ...pictureColumns,
        categoryId: products.categoryId,
        boxVolume: products.boxVolume,
        boxWeight: products.boxWeight,
        boxCount: products.boxCount,
        lineNoteEnabled: products.lineNoteEnabled,
        lineNotePrompt: products.lineNotePrompt,
        taxRate: products.taxRate,
        ...unitColumns,
        ...availabilityColumns,
        ...partsColumns,
        pairedCount: pairedCountOf(),
        deletedAt: products.deletedAt,
        deletedBy: products.deletedBy,
        publishedAt: products.publishedAt,
        // `$count` rather than a hand-written `exists`: inside an `sql`
        // template the outer `products.id` would bind unqualified.
        orderLines: this.db.$count(
          orderItems,
          eq(orderItems.productId, products.id),
        ),
      })
      .from(products)
      .where(and(eq(products.slug, slug), visibility))
      .limit(1);
    if (!product) return null;

    const rows = await this.categoryRows();
    const category = rows.find((row) => row.id === product.categoryId);
    if (!category) return null;

    const definitions = await this.categoryDefinitions(category.id, rows);
    const attributes = await this.attributesFor(
      product.id,
      new Set(definitions.map((definition) => definition.slug)),
    );

    const documentRows = await this.documentsFor(product.id);

    // Only an admin's read reaches a product with no price; it reads as zero.
    const priced = { ...product, priceMinor: product.priceMinor ?? 0 };
    const detail: ProductDetail = {
      slug: product.slug,
      name: product.name,
      priceMinor: priced.priceMinor,
      prices: unitPricesOf(priced),
      packaging: packagingOf(product),
      boxDimensions: boxDimensionsOf(product),
      descriptionHtml: product.descriptionHtml,
      ...picturesOf(product),
      attributes,
      lineNoteEnabled: product.lineNoteEnabled,
      lineNotePrompt: product.lineNotePrompt,
      availability: product.availability,
      taxRate: effectiveTaxRate(this.tax, product.taxRate),
      pairedCount: product.pairedCount,
      parts: product.parts,
      documents: documentRows,
      category: {
        slug: category.slug,
        name: category.name,
        shortName: category.shortName,
        ancestors: ancestorsOf(category.id, rows),
      },
    };
    return { product: detail, row: product };
  }

  /**
   * A product's attributes in the admin's row order — `sortOrder` is the order,
   * so it has to be asked for explicitly.
   *
   * Left-joined to the registry by name, for the unit and the filter link: a
   * key matching no definition still renders, exactly as it is stored
   * (FR-ATTR-02).
   *
   * `filterable` is the set of slugs this product's own category offers
   * (FR-ATTR-11). An attribute the category does not filter by keeps its unit
   * and its row and loses only the link — it would otherwise lead to a listing
   * whose panel cannot show or clear the filter.
   */
  private async attributesFor(
    productId: string,
    filterable: Set<string>,
  ): Promise<ProductDetailAttribute[]> {
    const rows = await this.db
      .select({
        key: productAttributes.key,
        part: productAttributes.part,
        value: productAttributes.value,
        numeric: productAttributes.valueNumeric,
        unit: attributeDefinitions.unit,
        slug: attributeDefinitions.slug,
        type: attributeDefinitions.type,
      })
      .from(productAttributes)
      .leftJoin(
        attributeDefinitions,
        eq(attributeDefinitions.name, productAttributes.key),
      )
      .where(eq(productAttributes.productId, productId))
      .orderBy(asc(productAttributes.sortOrder));

    return rows.map((row) => ({
      // As the admin wrote it: the part qualifies the row on the page, and
      // the join above matched on the key alone (FR-CAT-10).
      key: joinAttributeKey(row),
      value: row.value,
      unit: row.unit,
      // Only where a facet would actually offer this value: a number
      // attribute's unparseable value has no checkbox to link to (FR-ATTR-03).
      filterSlug:
        row.slug &&
        filterable.has(row.slug) &&
        (row.type !== 'number' || row.numeric !== null)
          ? row.slug
          : null,
    }));
  }

  /**
   * The documents a product page lists (FR-DOC-03). Expired ones are dropped
   * here rather than hidden in the template, so nothing downstream — the
   * count, the heading, the SSR markup — can disagree about what is current.
   *
   * A document with no expiry never runs out and is always listed. Soonest
   * expiry first, undated ones last, which puts the certificate a customer is
   * most likely asking about at the top.
   */
  private async documentsFor(productId: string): Promise<PublicDocument[]> {
    const today = isoToday();
    const rows = await this.db
      .select({
        title: documents.title,
        url: documents.fileUrl,
        contentType: documents.contentType,
        byteSize: documents.byteSize,
        link: documents.link,
      })
      .from(documentProducts)
      .innerJoin(documents, eq(documents.id, documentProducts.documentId))
      .where(
        and(
          eq(documentProducts.productId, productId),
          or(isNull(documents.expiresAt), gte(documents.expiresAt, today)),
        ),
      )
      .orderBy(asc(documents.expiresAt), asc(documents.title));

    // The column is a varchar; the contract's own parse is what decides the
    // type is one it accepts, exactly as the upload's sniff did on the way in.
    return rows.map(({ title, url, contentType, byteSize, link }) =>
      publicDocumentSchema.parse({
        title,
        file: url === null ? null : { url, contentType, byteSize },
        link,
      }),
    );
  }
}
