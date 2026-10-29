import * as z from 'zod';
import { ACCEPTED_DOCUMENT_MIME_TYPES } from '../../platform/media-constants';
import { ATTRIBUTE_TYPES } from './attribute-value';
import { PRODUCT_AVAILABILITIES } from './product-availability';

/** The kinds a registered attribute can take. */
export const attributeTypeSchema = z.enum(ATTRIBUTE_TYPES);

/** A stored file as a product page offers it: where it is, and the two facts
 * that say what pressing it costs — the format and the size. */
export const publicDocumentFileSchema = z
  .object({
    url: z.string(),
    contentType: z.enum(ACCEPTED_DOCUMENT_MIME_TYPES),
    byteSize: z.number().int().positive(),
  })
  .strict();
export type PublicDocumentFile = z.infer<typeof publicDocumentFileSchema>;

/**
 * A document as a *product page* shows it (FR-DOC-03/05): a title to click,
 * the file behind it, the link to where it is held elsewhere, or both. No
 * dates: an expired document is not listed at all, and an issue date is
 * filing, not shopping.
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
 * One image in a gallery/carousel (FR-CAT-04/05), as two media-store URLs:
 * `thumb` for grid/list (and search), `full` for the product page. Order is the
 * array order. No alt — the UI uses the product name.
 */
export const catalogImageSchema = z
  .object({
    full: z.string(),
    thumb: z.string(),
  })
  .strict();
export type CatalogImage = z.infer<typeof catalogImageSchema>;

/**
 * A product's picture, with the name of the variant it shows (FR-CAT-11) — null
 * for a picture of the whole range, and for every picture of a product that
 * names no variants. A picture of an unavailable variant is never sent
 * (FR-CAT-12).
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
 * Price as an integer in the currency's minor unit (e.g. cents). The currency
 * and its formatting are a per-deployment concern (deployment config), not part
 * of this contract — the API stays currency-agnostic and free of float
 * rounding. Resolved server-side: which tier's list it came from (FR-AUTH-05)
 * is invisible here.
 */
export const priceMinorSchema = z.number().int().nonnegative();

/**
 * A price as it is *written*. Zero is refused here and nowhere else: a product
 * that costs nothing is a product with no price, which the catalog already
 * says by storing none, and two spellings of one state is what the null is
 * there to avoid.
 *
 * Reads stay `priceMinorSchema`: a deployment may hold zeros written before
 * this rule, and the storefront quotes what is stored rather than refusing to
 * render it.
 */
export const priceInputMinorSchema = z.number().int().positive();

/**
 * What a product costs, per unit it can be bought in (FR-UNIT-05). `pack` and
 * `box` are null where the packaging does not define them.
 *
 * All three are exact whole minor units, and every one of them is `piece`
 * multiplied out: a price is the price of a piece, so a total is a
 * multiplication with nothing rounded, whichever lens the quantity is read
 * through. `pack` and `box` are published rather than left to the browser only
 * so that one arithmetic, the server's, produces every figure shown.
 */
export const unitPricesSchema = z
  .object({
    piece: priceMinorSchema,
    pack: priceMinorSchema.nullable(),
    box: priceMinorSchema.nullable(),
  })
  .strict();
export type UnitPrices = z.infer<typeof unitPricesSchema>;

/**
 * How the units nest, and the smallest piece quantity that may be ordered —
 * enough for the browser to correct a quantity without a round trip.
 */
export const productPackagingSchema = z
  .object({
    piecesPerPack: z.number().int().positive().nullable(),
    packsPerBox: z.number().int().positive().nullable(),
    /** The floor for a piece quantity, not its increment — the pack is that
     * (`pieceStep`). 1 means unconstrained. */
    minPieceQty: z.number().int().positive(),
  })
  .strict();
export type ProductPackagingInfo = z.infer<typeof productPackagingSchema>;

/**
 * A box's shipping facts. The dimensions are decimal strings, not numbers: they
 * are shown rather than calculated with, and a float round-trip would turn
 * 1.250 into 1.25.
 *
 * `count` is how many boxes the product ships as, and is informational only —
 * the volume and weight already cover the whole consignment, so nothing
 * multiplies by it (FR-UNIT-11).
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
 * What a customer learns about the stock (FR-STOCK-02/03) — the state, never
 * the count, which stays staff-facing. Null where the deployment does not track
 * this product's stock, and every surface renders that as nothing at all.
 */
export const availabilitySchema = z.enum(PRODUCT_AVAILABILITIES).nullable();

/** A tile in the product grid (FR-CAT-04). */
export const productListItemSchema = z
  .object({
    slug: z.string(),
    name: z.string(),
    /** The per-piece price rounded to whole minor units, as surfaces showed it
     * before units existed. Prefer `prices`; never an input to a total. */
    priceMinor: priceMinorSchema,
    prices: unitPricesSchema,
    packaging: productPackagingSchema,
    images: z.array(productImageSchema),
    /** Every variant, unavailable ones included: a row's mark opens the list
     * (FR-CAT-13), and a card's labels are read off the images. */
    variants: z.array(productVariantSchema),
    /** Whether this product's line takes a free-text note (FR-CART-08). A
     * listing sells as readily as the product page does, so it has to know:
     * the buying controls ask for the note before the first add. */
    lineNoteEnabled: z.boolean(),
    /** The product's own wording for the note; null falls back to storefront-text. */
    lineNotePrompt: z.string().nullable(),
    /** Whether it can be had at all (FR-STOCK-03); null where untracked. */
    availability: availabilitySchema,
    /**
     * How many products this one is sold together with (FR-SET-05), counting
     * only the ones a customer could actually add — a counterpart that is
     * unpublished or withdrawn is kept as an edge for the admin but is not a
     * product on offer.
     *
     * A count rather than the counterparts themselves: every surface that
     * draws a product has to know whether to put the marker there, on the
     * first frame and without a second request, while the list behind it is
     * worth fetching only for the one product whose marker is pressed.
     */
    pairedCount: z.number().int().nonnegative(),
    /** What one piece is made of where it is sold as a set (FR-CAT-10); empty
     * for a product sold as itself. The marker is drawn from this alone. */
    parts: z.array(z.string()),
  })
  .strict();
export type ProductListItem = z.infer<typeof productListItemSchema>;

/**
 * A freetext key/value characteristic (FR-CAT-05) — as the admin enters it, and
 * as the admin API reads it back.
 */
export const productAttributeSchema = z
  .object({
    key: z.string(),
    value: z.string(),
  })
  .strict();
export type ProductAttribute = z.infer<typeof productAttributeSchema>;

/**
 * The same, as the product page reads it.
 *
 * `unit` is the declared attribute's unit where the key matches a definition
 * (FR-ATTR-01/02), and null everywhere else. The stored value never carries its
 * unit, which is what lets the spec table read "1000 g" from a value stored as
 * "1000" — joining the two is `formatAttributeValue`, shared with the facet
 * labels.
 *
 * `filterSlug` is the definition's slug, and is what turns the row into a link
 * into the filtered listing (FR-ATTR-08). It is null unless *this value* would
 * actually be offered as a facet: a number attribute's unparseable value is
 * still shown, but linking it would land on a listing that filters by something
 * no checkbox offers.
 *
 * Read-only, so it is deliberately not the shape the editor writes: both fields
 * belong to the definition, and a product save must not be able to set them.
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

/**
 * The rich-text vocabulary a product description may use — the static-page set
 * (`RICH_TEXT_TAGS`) minus headings, links and images: paragraphs, inline
 * emphasis (bold/italic/underline/strike), lists, block quotes and a divider.
 * Declared here as the shared contract; the sanitizer that enforces it lives
 * with the product editor (FR-ADM). On the read path the stored HTML is already
 * trusted, same as pages.
 */
export const PRODUCT_RICH_TEXT_TAGS = [
  'p',
  'br',
  'strong',
  'em',
  'u',
  's',
  'ul',
  'ol',
  'li',
  'blockquote',
  'hr',
] as const;

/**
 * An optional admin-set nickname, shown wherever the owning parent category is
 * already on screen — subcategory tiles and chips, breadcrumbs.
 */
export const shortNameSchema = z.string().nullable();

/**
 * A category's mark (FR-CAT-07): the small square image shown beside the name
 * on the chip that draws the category everywhere it appears. Square by
 * construction — the upload trims it. Null for the categories that have none,
 * which is most of them.
 */
export const categoryMarkSchema = catalogImageSchema.nullable();

/** A breadcrumb ancestor of the selected category, root-first. Carries the
 * nickname too: a crumb always sits next to its parent. */
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
    /** The rounded per-piece price; see `productListItemSchema`. */
    priceMinor: priceMinorSchema,
    prices: unitPricesSchema,
    packaging: productPackagingSchema,
    /** Null where the product has no box. */
    boxDimensions: boxDimensionsSchema.nullable(),
    /** Sanitized rich text, server-owned (same discipline as page bodies). */
    descriptionHtml: z.string(),
    images: z.array(productImageSchema),
    variants: z.array(productVariantSchema),
    attributes: z.array(productDetailAttributeSchema),
    /** Whether the buying block offers a free-text note (FR-CART-08). */
    lineNoteEnabled: z.boolean(),
    /** The product's own wording for the note; null falls back to storefront-text. */
    lineNotePrompt: z.string().nullable(),
    /** Whether it can be had at all (FR-STOCK-03); null where untracked. */
    availability: availabilitySchema,
    /**
     * The rate this product is taxed at (NFR-LEGAL-11): its own, or the
     * deployment's default. Null where the deployment charges no tax. Resolved
     * here, so no page has to know which of the two applies.
     */
    taxRate: z.number().nullable(),
    /**
     * How many products this one is sold together with (FR-SET-05), counting
     * only the ones a customer could actually add — a counterpart that is
     * unpublished or withdrawn is kept as an edge for the admin but is not a
     * product on offer.
     *
     * A count rather than the counterparts themselves: every surface that
     * draws a product has to know whether to put the marker there, on the
     * first frame and without a second request, while the list behind it is
     * worth fetching only for the one product whose marker is pressed.
     */
    pairedCount: z.number().int().nonnegative(),
    /** What one piece is made of where it is sold as a set (FR-CAT-10). */
    parts: z.array(z.string()),
    /**
     * The documents shown on this product (FR-DOC-03), soonest expiry first.
     * Expired ones are absent: a certificate that has run out is work for the
     * admin, never a link for a customer.
     *
     * Inline rather than fetched on demand like the pairings, because these
     * are a handful of rows already joined to the product and the page draws
     * them without being asked.
     */
    documents: z.array(publicDocumentSchema),
    /** The single category this product belongs to, with its own ancestors —
     * the breadcrumb shows the whole path, not just the leaf. */
    category: categoryCrumbSchema.extend({
      ancestors: z.array(categoryCrumbSchema),
    }),
  })
  .strict();
export type ProductDetail = z.infer<typeof productDetailSchema>;
