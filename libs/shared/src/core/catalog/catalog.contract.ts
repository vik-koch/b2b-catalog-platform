import * as z from 'zod';
import { ACCEPTED_DOCUMENT_MIME_TYPES } from '../../platform/media-constants';
import { ATTRIBUTE_TYPES } from './attributes';
import { PRODUCT_AVAILABILITIES } from './product-availability';
import type { ProductPackaging } from './product-units';

export const attributeTypeSchema = z.enum(ATTRIBUTE_TYPES);

/** A stored file as a product page offers it, with the format and size that
 * say what opening it costs. */
export const publicDocumentFileSchema = z
  .object({
    url: z.string(),
    contentType: z.enum(ACCEPTED_DOCUMENT_MIME_TYPES),
    byteSize: z.number().int().positive(),
  })
  .strict();
export type PublicDocumentFile = z.infer<typeof publicDocumentFileSchema>;

/**
 * A document as a product page shows it (FR-DOC-03/05): a title, the file, the
 * link to where it is held elsewhere, or both. No dates: an expired document is
 * not listed, and an issue date is filing, not shopping.
 */
export const publicDocumentSchema = z
  .object({
    title: z.string(),
    file: publicDocumentFileSchema.nullable(),
    link: z.string().nullable(),
  })
  .strict();
export type PublicDocument = z.infer<typeof publicDocumentSchema>;

/**
 * One image as two media-store URLs (FR-CAT-04/05): `thumb` for tiles, rows and
 * search, `full` for the product page. No alt: the UI uses the product name.
 */
export const catalogImageSchema = z
  .object({
    full: z.string(),
    thumb: z.string(),
  })
  .strict();
export type CatalogImage = z.infer<typeof catalogImageSchema>;

/**
 * A product's picture with the name of the variant it shows (FR-CAT-11), null
 * for a picture of the whole range. Pictures of unavailable variants are never
 * sent (FR-CAT-12).
 */
export const productImageSchema = catalogImageSchema
  .extend({ variant: z.string().nullable() })
  .strict();
export type ProductImage = z.infer<typeof productImageSchema>;

/** One of the variants a product names, in the shop's order (FR-CAT-11/12). */
export const productVariantSchema = z
  .object({
    name: z.string(),
    unavailable: z.boolean(),
  })
  .strict();
export type ProductVariant = z.infer<typeof productVariantSchema>;

/**
 * A price in the currency's minor unit, resolved server-side from the visitor's
 * tier (FR-AUTH-05). The currency is the deployment's, so the API stays
 * currency-agnostic and free of float rounding.
 */
export const priceMinorSchema = z.number().int().nonnegative();

/**
 * What a product costs per unit it is sold in (FR-UNIT-05); `pack` and `box`
 * are null where the packaging has none. Each is `piece` multiplied out, and
 * published so that the server's arithmetic produces every figure shown.
 */
export const unitPricesSchema = z
  .object({
    piece: priceMinorSchema,
    pack: priceMinorSchema.nullable(),
    box: priceMinorSchema.nullable(),
  })
  .strict();
export type UnitPrices = z.infer<typeof unitPricesSchema>;

/** Enough for the browser to correct a quantity without a round trip. */
export const productPackagingSchema = z
  .object({
    piecesPerPack: z.number().int().positive().nullable(),
    packsPerBox: z.number().int().positive().nullable(),
    /** The floor for a piece quantity, not its increment (`pieceStep`). */
    minPieceQty: z.number().int().positive(),
  })
  .strict() satisfies z.ZodType<ProductPackaging>;

/**
 * A box's shipping facts. The dimensions are decimal strings: they are shown,
 * never calculated with, and a float would turn 1.250 into 1.25. `count` is
 * informational: volume and weight already cover the consignment (FR-UNIT-11).
 */
export const boxDimensionsSchema = z
  .object({
    volume: z.string().nullable(),
    weight: z.string().nullable(),
    count: z.number().int().positive(),
  })
  .strict();
export type BoxDimensions = z.infer<typeof boxDimensionsSchema>;

/**
 * The stock state a customer sees, never the count (FR-STOCK-02/03). Null
 * where the deployment does not track this product's stock.
 */
export const availabilitySchema = z.enum(PRODUCT_AVAILABILITIES).nullable();

/** A tile in the product grid (FR-CAT-04). */
export const productListItemSchema = z
  .object({
    slug: z.string(),
    name: z.string(),
    prices: unitPricesSchema,
    packaging: productPackagingSchema,
    images: z.array(productImageSchema),
    /** Unavailable ones included: a row's mark opens the list (FR-CAT-13). */
    variants: z.array(productVariantSchema),
    /** Whether the line takes a free-text note (FR-CART-08): a tile sells too,
     * and asks for the note before the first add. */
    lineNoteEnabled: z.boolean(),
    /** Null falls back to the storefront text. */
    lineNotePrompt: z.string().nullable(),
    availability: availabilitySchema,
    /**
     * How many products a customer could add alongside this one (FR-SET-05).
     * A count, so every surface can draw the marker on the first frame; the
     * list is fetched only when a marker is pressed.
     */
    pairedCount: z.number().int().nonnegative(),
    /** What one piece is made of, for a set (FR-CAT-10); empty otherwise. */
    parts: z.array(z.string()),
  })
  .strict();
export type ProductListItem = z.infer<typeof productListItemSchema>;

/** A freetext key/value characteristic (FR-CAT-05). */
export const productAttributeSchema = z
  .object({
    key: z.string(),
    value: z.string(),
  })
  .strict();
export type ProductAttribute = z.infer<typeof productAttributeSchema>;

/**
 * The same, as the product page reads it. Both additions belong to the
 * matching definition, so a product save can never set them.
 *
 * `unit` is null where no definition matches (FR-ATTR-01/02).
 * `filterSlug` links the row to the filtered listing (FR-ATTR-08), and is null
 * unless this value is offered as a facet: a number attribute's unparseable
 * value would link to a filter no checkbox offers.
 */
export const productDetailAttributeSchema = productAttributeSchema
  .extend({
    unit: z.string().nullable(),
    filterSlug: z.string().nullable(),
  })
  .strict();
export type ProductDetailAttribute = z.infer<
  typeof productDetailAttributeSchema
>;

/** A category's nickname, shown where its parent is already on screen. */
export const shortNameSchema = z.string().nullable();

/** A breadcrumb ancestor, root first. A crumb sits next to its parent, so it
 * carries the nickname. */
export const categoryCrumbSchema = z
  .object({
    slug: z.string(),
    name: z.string(),
    shortName: shortNameSchema,
  })
  .strict();
export type CategoryCrumb = z.infer<typeof categoryCrumbSchema>;

/** The full product page (FR-CAT-05). */
export const productDetailSchema = z
  .object({
    slug: z.string(),
    name: z.string(),
    prices: unitPricesSchema,
    packaging: productPackagingSchema,
    boxDimensions: boxDimensionsSchema.nullable(),
    /** Sanitized on write, like a page body. */
    descriptionHtml: z.string(),
    images: z.array(productImageSchema),
    variants: z.array(productVariantSchema),
    attributes: z.array(productDetailAttributeSchema),
    lineNoteEnabled: z.boolean(),
    lineNotePrompt: z.string().nullable(),
    availability: availabilitySchema,
    /** The product's own rate or the deployment's default (NFR-LEGAL-11), null
     * where no tax is charged: resolved here so no page picks between them. */
    taxRate: z.number().nullable(),
    /** See `productListItemSchema`. */
    pairedCount: z.number().int().nonnegative(),
    parts: z.array(z.string()),
    /**
     * Soonest expiry first, expired ones absent (FR-DOC-03). Inline, unlike the
     * pairings: a handful of rows the page always draws.
     */
    documents: z.array(publicDocumentSchema),
    /** With its ancestors: the breadcrumb shows the whole path. */
    category: categoryCrumbSchema.extend({
      ancestors: z.array(categoryCrumbSchema),
    }),
  })
  .strict();
export type ProductDetail = z.infer<typeof productDetailSchema>;
