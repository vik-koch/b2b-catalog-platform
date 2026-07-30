import { Client } from 'pg';
import { sanitizeRichText } from '@b2b-catalog-platform/shared/node';
import { categorySeeds, productSeeds } from './catalog-data';
import {
  generateCategoryImage,
  generateProductImages,
} from './catalog-placeholders';

/**
 * Seeds the demo catalog: categories (parents first, so the FK resolves) then
 * products, each with generated placeholder images written to the media store.
 * Idempotent — upserts by the sync keys (`sourceId` / `sourceId`) and reuses
 * content-addressed image files, so a re-seed neither duplicates rows nor files.
 */
export async function seedCatalog(
  client: Client,
  mediaRoot: string,
): Promise<void> {
  const idByKey = new Map<string, string>();

  for (const category of categorySeeds) {
    const image = category.hasImage
      ? await generateCategoryImage(mediaRoot, category.sourceId)
      : null;
    const parentId = category.parentKey
      ? (idByKey.get(category.parentKey) ?? null)
      : null;

    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO categories ("sourceId", slug, name, "parentId", "sortOrder", image)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb)
       ON CONFLICT ("sourceId") DO UPDATE SET
         slug = EXCLUDED.slug, name = EXCLUDED.name,
         "parentId" = EXCLUDED."parentId", "sortOrder" = EXCLUDED."sortOrder",
         image = EXCLUDED.image
       RETURNING id`,
      [
        category.sourceId,
        category.slug,
        category.name,
        parentId,
        category.sortOrder,
        image ? JSON.stringify(image) : null,
      ],
    );
    idByKey.set(category.sourceId, rows[0].id);
  }

  for (const product of productSeeds) {
    const categoryId = idByKey.get(product.categoryKey);
    if (!categoryId) {
      throw new Error(
        `Seed product ${product.sourceId} references unknown category ${product.categoryKey}`,
      );
    }
    const images = await generateProductImages(
      mediaRoot,
      product.slug,
      product.imageCount,
    );

    await client.query(
      `INSERT INTO products
         ("sourceId", slug, name, "priceMinor", "categoryId", "descriptionHtml", attributes, images)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb)
       ON CONFLICT ("sourceId") DO UPDATE SET
         slug = EXCLUDED.slug, name = EXCLUDED.name,
         "priceMinor" = EXCLUDED."priceMinor", "categoryId" = EXCLUDED."categoryId",
         "descriptionHtml" = EXCLUDED."descriptionHtml",
         attributes = EXCLUDED.attributes, images = EXCLUDED.images`,
      [
        product.sourceId,
        product.slug,
        product.name,
        product.priceMinor,
        categoryId,
        sanitizeRichText(product.descriptionHtml),
        JSON.stringify(product.attributes),
        JSON.stringify(images),
      ],
    );
  }
}
