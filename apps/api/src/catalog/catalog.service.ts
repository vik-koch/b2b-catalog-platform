import { Inject, Injectable } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { and, asc, count, eq, inArray, isNull } from 'drizzle-orm';
import {
  CATALOG_PAGE_SIZE,
  CategoryNode,
  ProductDetail,
  ProductListItem,
} from '@b2b-catalog-platform/shared';
import { DRIZZLE } from '../db/database.module';
import * as schema from '../db/schema';
import { categories, products } from '../db/schema';
import {
  ancestorsOf,
  buildCategoryTree,
  categoryBySlug,
  CategoryRow,
  descendantIds,
  directChildren,
} from './catalog-tree';

interface CategoryProductsResult {
  category: {
    slug: string;
    name: string;
    ancestors: { slug: string; name: string }[];
    subcategories: { slug: string; name: string; imageUrl: string | null }[];
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
        imageUrl: categories.imageUrl,
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
