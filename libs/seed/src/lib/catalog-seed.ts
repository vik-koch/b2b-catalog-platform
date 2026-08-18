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

    const packaging = product.packaging ?? {};

    await client.query(
      `INSERT INTO products
         ("sourceId", slug, name, "defaultPriceMinor", "categoryId", "descriptionHtml", attributes, images,
          "piecesPerPack", "packsPerBox", "minPieceQty", "priceBasisPieces", "boxVolume", "boxWeight",
          "publishedAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9, $10, $11, $12, $13, $14, now())
       ON CONFLICT ("sourceId") DO UPDATE SET
         slug = EXCLUDED.slug, name = EXCLUDED.name,
         "defaultPriceMinor" = EXCLUDED."defaultPriceMinor", "categoryId" = EXCLUDED."categoryId",
         "descriptionHtml" = EXCLUDED."descriptionHtml",
         attributes = EXCLUDED.attributes, images = EXCLUDED.images,
         "piecesPerPack" = EXCLUDED."piecesPerPack", "packsPerBox" = EXCLUDED."packsPerBox",
         "minPieceQty" = EXCLUDED."minPieceQty", "priceBasisPieces" = EXCLUDED."priceBasisPieces",
         "boxVolume" = EXCLUDED."boxVolume", "boxWeight" = EXCLUDED."boxWeight",
         -- The demo catalog is meant to be on the storefront; a re-seed of an
         -- unpublished row puts it back.
         "publishedAt" = EXCLUDED."publishedAt"`,
      [
        product.sourceId,
        product.slug,
        product.name,
        product.priceMinor,
        categoryId,
        sanitizeRichText(product.descriptionHtml),
        JSON.stringify(product.attributes),
        JSON.stringify(images),
        packaging.piecesPerPack ?? null,
        packaging.packsPerBox ?? null,
        packaging.minPieceQty ?? 1,
        packaging.priceBasisPieces ?? 1,
        packaging.boxVolume ?? null,
        packaging.boxWeight ?? null,
      ],
    );
  }
}
