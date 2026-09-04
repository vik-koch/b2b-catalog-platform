import { Client } from 'pg';
import {
  DEFAULT_LOW_STOCK_THRESHOLD_PIECES,
  parseAttributeNumber,
  ProductAttribute,
  productAvailability,
} from '@b2b-catalog-platform/shared';
import { sanitizeRichText } from '@b2b-catalog-platform/shared/node';
import {
  attributeDefinitionSeeds,
  categorySeeds,
  pairingSeeds,
  productSeeds,
} from './catalog-data';
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
    // The seed writes rows directly, so it owns the recompute the admin save
    // does: the stored state has to match the figure beside it or the check
    // constraint rejects the row.
    const stockPieces = product.stockPieces ?? null;
    const availability = productAvailability(
      stockPieces,
      {
        piecesPerPack: packaging.piecesPerPack ?? null,
        packsPerBox: packaging.packsPerBox ?? null,
      },
      null,
      DEFAULT_LOW_STOCK_THRESHOLD_PIECES,
    );

    const { rows: productRows } = await client.query<{ id: string }>(
      `INSERT INTO products
         ("sourceId", slug, name, "defaultPriceMinor", "categoryId", "descriptionHtml", images,
          "piecesPerPack", "packsPerBox", "minPieceQty", "priceBasisPieces", "boxVolume", "boxWeight",
          "boxCount", "lineNoteEnabled", "lineNotePrompt", "stockPieces", availability, "publishedAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, now())
       ON CONFLICT ("sourceId") DO UPDATE SET
         slug = EXCLUDED.slug, name = EXCLUDED.name,
         "defaultPriceMinor" = EXCLUDED."defaultPriceMinor", "categoryId" = EXCLUDED."categoryId",
         "descriptionHtml" = EXCLUDED."descriptionHtml",
         images = EXCLUDED.images,
         "piecesPerPack" = EXCLUDED."piecesPerPack", "packsPerBox" = EXCLUDED."packsPerBox",
         "minPieceQty" = EXCLUDED."minPieceQty", "priceBasisPieces" = EXCLUDED."priceBasisPieces",
         "boxVolume" = EXCLUDED."boxVolume", "boxWeight" = EXCLUDED."boxWeight",
         "boxCount" = EXCLUDED."boxCount",
         "lineNoteEnabled" = EXCLUDED."lineNoteEnabled",
         "lineNotePrompt" = EXCLUDED."lineNotePrompt",
         "stockPieces" = EXCLUDED."stockPieces",
         availability = EXCLUDED.availability,
         -- The demo catalog is meant to be on the storefront; a re-seed of an
         -- unpublished row puts it back.
         "publishedAt" = EXCLUDED."publishedAt"
       RETURNING id`,
      [
        product.sourceId,
        product.slug,
        product.name,
        product.priceMinor,
        categoryId,
        sanitizeRichText(product.descriptionHtml),
        JSON.stringify(images),
        packaging.piecesPerPack ?? null,
        packaging.packsPerBox ?? null,
        packaging.minPieceQty ?? 1,
        packaging.priceBasisPieces ?? 1,
        packaging.boxVolume ?? null,
        packaging.boxWeight ?? null,
        packaging.boxCount ?? 1,
        product.lineNoteEnabled ?? false,
        product.lineNotePrompt ?? null,
        stockPieces,
        availability,
      ],
    );

    await seedProductAttributes(client, productRows[0].id, product.attributes);
  }

  await seedAttributeDefinitions(client);
  await seedPairings(client);
}

/**
 * The sold-together edges (FR-SET-01). Written by slug and ordered by id, the
 * way the write path stores them, so a pairing is one row whichever product is
 * named first. Only the demo's own edges are touched — a pairing an admin made
 * in the demo survives a re-seed, since nothing here can tell it from one of
 * these apart from the pair it names.
 */
async function seedPairings(client: Client): Promise<void> {
  for (const [one, other] of pairingSeeds) {
    await client.query(
      `INSERT INTO product_pairings ("productAId", "productBId")
       SELECT least(a.id, b.id), greatest(a.id, b.id)
       FROM products a, products b
       WHERE a.slug = $1 AND b.slug = $2
       ON CONFLICT DO NOTHING`,
      [one, other],
    );
  }
}

/**
 * Which attribute keys are filterable (FR-ATTR-01). Upserted by slug — the slug
 * is what a shared filter link is written with, so it is the identity here as
 * well; a renamed name is restored, as everywhere else the seed owns content.
 * Definitions hold no product data, so nothing depends on the order they land
 * in relative to the products.
 */
async function seedAttributeDefinitions(client: Client): Promise<void> {
  for (const [index, definition] of attributeDefinitionSeeds.entries()) {
    await client.query(
      `INSERT INTO attribute_definitions (name, slug, type, unit, "sortOrder")
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (slug) DO UPDATE SET
         name = EXCLUDED.name, type = EXCLUDED.type,
         unit = EXCLUDED.unit, "sortOrder" = EXCLUDED."sortOrder"`,
      [
        definition.name,
        definition.slug,
        definition.type,
        definition.unit,
        index,
      ],
    );
  }
}

/**
 * Attributes are rows, and the seed's list is the whole truth — replaced
 * wholesale, like a product save does. `valueNumeric` is parsed here exactly as
 * the API parses it.
 */
async function seedProductAttributes(
  client: Client,
  productId: string,
  attributes: ProductAttribute[],
): Promise<void> {
  await client.query('DELETE FROM product_attributes WHERE "productId" = $1', [
    productId,
  ]);
  for (const [index, attribute] of attributes.entries()) {
    const numeric = parseAttributeNumber(attribute.value);
    await client.query(
      `INSERT INTO product_attributes
         ("productId", "sortOrder", key, value, "valueNumeric")
       VALUES ($1, $2, $3, $4, $5)`,
      [productId, index, attribute.key, attribute.value, numeric],
    );
  }
}
