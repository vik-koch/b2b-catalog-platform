import { Inject, Injectable } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { and, asc, count, desc, eq, inArray, isNull } from 'drizzle-orm';
import {
  CatalogImage,
  CATALOG_PAGE_SIZE,
  CategoryNode,
  ProductDetail,
  ProductListItem,
  SitemapEntry,
} from '@b2b-catalog-platform/shared';
import { DRIZZLE } from '../db/database.module';
import * as schema from '../db/schema';
import { categories, pages, products } from '../db/schema';
import {
  ancestorsOf,
  buildCategoryTree,
  categoryBySlug,
  CategoryRow,
  descendantIds,
  directChildren,
} from './catalog-tree';
import {
  parseSearchQuery,
  relevanceScore,
  searchCondition,
  setSearchThreshold,
} from './product-search';

interface SearchResult {
  items: ProductListItem[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

interface CategoryProductsResult {
  category: {
    slug: string;
    name: string;
    ancestors: { slug: string; name: string }[];
    subcategories: {
      slug: string;
      name: string;
      image: CatalogImage | null;
    }[];
  };
  items: ProductListItem[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

/**
 * The DB-backed storefront read model (FR-CAT-01…05). Soft-deleted products are
 * excluded everywhere. The category tree is small, so it is fetched whole and
 * shaped in memory (see catalog-tree.ts) rather than with recursive SQL.
 */
@Injectable()
export class CatalogService {
  constructor(@Inject(DRIZZLE) private db: NodePgDatabase<typeof schema>) {}

  private categoryRows(): Promise<CategoryRow[]> {
    return this.db
      .select({
        id: categories.id,
        slug: categories.slug,
        name: categories.name,
        parentId: categories.parentId,
        image: categories.image,
        sortOrder: categories.sortOrder,
      })
      .from(categories)
      .orderBy(asc(categories.sortOrder), asc(categories.name));
  }

  async getCategoryTree(): Promise<CategoryNode[]> {
    return buildCategoryTree(await this.categoryRows());
  }

  async getCategoryProducts(
    slug: string,
    page: number,
  ): Promise<CategoryProductsResult | null> {
    const rows = await this.categoryRows();
    const category = categoryBySlug(rows, slug);
    if (!category) return null;

    const ids = descendantIds(category.id, rows);
    const where = and(
      inArray(products.categoryId, ids),
      isNull(products.deletedAt),
    );

    const [{ value: total }] = await this.db
      .select({ value: count() })
      .from(products)
      .where(where);

    const pageSize = CATALOG_PAGE_SIZE;
    const items = await this.db
      .select({
        slug: products.slug,
        name: products.name,
        priceMinor: products.priceMinor,
        images: products.images,
      })
      .from(products)
      .where(where)
      .orderBy(asc(products.name))
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    return {
      category: {
        slug: category.slug,
        name: category.name,
        ancestors: ancestorsOf(category.id, rows),
        subcategories: directChildren(category.id, rows),
      },
      items,
      pagination: {
        page,
        pageSize,
        total: Number(total),
        totalPages: Math.ceil(Number(total) / pageSize),
      },
    };
  }

  /**
   * Product search by name (FR-SEARCH-01…03). Runs in a transaction only
   * because the trigram threshold is set with `SET LOCAL`; a query too short to
   * be worth running returns an empty page without touching the database.
   *
   * Ordering closes with `name, id`: without a total order two rows of equal
   * score could swap between page requests and be shown twice, or not at all.
   * Sort controls (FR-SEARCH-04) reuse this candidate set and land separately.
   */
  async searchProducts(rawQuery: string, page: number): Promise<SearchResult> {
    const pageSize = CATALOG_PAGE_SIZE;
    const query = parseSearchQuery(rawQuery);
    if (!query) {
      return {
        items: [],
        pagination: { page, pageSize, total: 0, totalPages: 0 },
      };
    }

    const where = and(isNull(products.deletedAt), searchCondition(query));

    return this.db.transaction(async (tx) => {
      await tx.execute(setSearchThreshold);

      const [{ value: total }] = await tx
        .select({ value: count() })
        .from(products)
        .where(where);

      const items = await tx
        .select({
          slug: products.slug,
          name: products.name,
          priceMinor: products.priceMinor,
          images: products.images,
        })
        .from(products)
        .where(where)
        .orderBy(
          desc(relevanceScore(query)),
          asc(products.name),
          asc(products.id),
        )
        .limit(pageSize)
        .offset((page - 1) * pageSize);

      return {
        items,
        pagination: {
          page,
          pageSize,
          total: Number(total),
          totalPages: Math.ceil(Number(total) / pageSize),
        },
      };
    });
  }

  /**
   * Every indexable slug for the sitemap: all categories, all non-deleted
   * products, and the DB-backed static pages, each with its `updatedAt` for
   * `<lastmod>` (a page's id is its public slug). Returns bare slugs only — the
   * SSR server builds the absolute URLs.
   */
  async getSitemap(): Promise<{
    categories: SitemapEntry[];
    products: SitemapEntry[];
    pages: SitemapEntry[];
  }> {
    const [categoryRows, productRows, pageRows] = await Promise.all([
      this.db
        .select({ slug: categories.slug, updatedAt: categories.updatedAt })
        .from(categories)
        .orderBy(asc(categories.slug)),
      this.db
        .select({ slug: products.slug, updatedAt: products.updatedAt })
        .from(products)
        .where(isNull(products.deletedAt))
        .orderBy(asc(products.slug)),
      this.db
        .select({ slug: pages.id, updatedAt: pages.updatedAt })
        .from(pages)
        .orderBy(asc(pages.id)),
    ]);
    const toEntry = (r: { slug: string; updatedAt: Date }): SitemapEntry => ({
      slug: r.slug,
      updatedAt: r.updatedAt.toISOString(),
    });
    return {
      categories: categoryRows.map(toEntry),
      products: productRows.map(toEntry),
      pages: pageRows.map(toEntry),
    };
  }

  async getProduct(slug: string): Promise<ProductDetail | null> {
    const [product] = await this.db
      .select({
        slug: products.slug,
        name: products.name,
        priceMinor: products.priceMinor,
        descriptionHtml: products.descriptionHtml,
        images: products.images,
        attributes: products.attributes,
        categoryId: products.categoryId,
      })
      .from(products)
      .where(and(eq(products.slug, slug), isNull(products.deletedAt)))
      .limit(1);
    if (!product) return null;

    const [category] = await this.db
      .select({ slug: categories.slug, name: categories.name })
      .from(categories)
      .where(eq(categories.id, product.categoryId))
      .limit(1);

    return {
      slug: product.slug,
      name: product.name,
      priceMinor: product.priceMinor,
      descriptionHtml: product.descriptionHtml,
      images: product.images,
      attributes: product.attributes,
      category,
    };
  }
}
