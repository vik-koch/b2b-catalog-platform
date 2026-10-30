import { oc } from '@orpc/contract';
import * as z from 'zod';
import {
  PRODUCT_NAME_MAX_LENGTH,
  SOURCE_ID_MAX_LENGTH,
} from '../../core/catalog/products';
import {
  PRODUCT_ATTRIBUTES_MAX,
  PRODUCT_DESCRIPTION_MAX_LENGTH,
  PRODUCT_IMAGES_MAX,
  PRODUCT_LINE_NOTE_PROMPT_MAX_LENGTH,
  PRODUCT_PAIRINGS_MAX,
  PRODUCT_TIER_PRICES_MAX,
} from './products';
import { commonAuthErrors } from '../../lib/core/api-error';
import { ownershipErrors } from '../../sync/ownership-constants';
import {
  availabilitySchema,
  catalogImageSchema,
  priceMinorSchema,
  productAttributeSchema,
} from '../../core/catalog/catalog.contract';
import { SEARCH_SORTS } from '../../core/catalog/product-sort';
import { SEARCH_QUERY_MAX_LENGTH } from '../../core/catalog/search';
import {
  hiddenProductSchema,
  productPageSchema,
} from '../../core/catalog/product-page.contract';
import { PRODUCT_DOCUMENTS_MAX } from './documents';
import { linkedDocumentSchema } from './documents.contract';
import { minimumFitsPacks } from '../../core/catalog/product-units';
import {
  ATTRIBUTE_NAME_MAX_LENGTH,
  ATTRIBUTE_VALUE_MAX_LENGTH,
} from '../../core/catalog/attributes';
import { PRODUCT_AVAILABILITIES } from '../../core/catalog/product-availability';
import {
  INCOMPLETE_GAPS,
  PRODUCT_FEATURES,
  PRODUCT_GAP_FILTERS,
} from './product-content';
import {
  isValidPartList,
  PRODUCT_PART_MAX_LENGTH,
  PRODUCT_PARTS_MAX,
} from '../../core/catalog/product-parts';
import {
  hasDistinctVariants,
  picturesNameKnownVariants,
  PRODUCT_VARIANT_NAME_MAX_LENGTH,
  PRODUCT_VARIANTS_MAX,
} from '../../core/catalog/product-variants';
import { slugSchema } from './slug.contract';
import { taxRateSchema } from '../../lib/config/tax-config';
import { CATALOG_ERRORS } from './catalog-errors';

/**
 * A price as it is written. Zero is refused: a product that costs nothing has
 * no price, which the catalog says by storing none. Reads keep
 * `priceMinorSchema`, so zeros stored before this rule still render.
 */
export const priceInputMinorSchema = z.number().int().positive();

/**
 * One tier's price for this product (FR-AUTH-05). Tiers are addressed by id
 * here rather than by their sync key: the editor already has the tier list in
 * hand, and an id survives a key being renamed mid-edit.
 *
 * The default list is **not** in this list — it is the product's own
 * `priceMinor`, kept its own field because the editor gives it its own control
 * beside the category. A tier absent from here has no price of its own and
 * falls back to the default list, which is how a tier carries only its
 * exceptions.
 */
export const productTierPriceSchema = z
  .object({
    tierId: z.uuid(),
    priceMinor: priceInputMinorSchema,
  })
  .strict();
export type ProductTierPrice = z.infer<typeof productTierPriceSchema>;

/**
 * A box dimension as the decimal string a `numeric(12,3)` column holds. A string
 * rather than a number so the digits an admin typed survive unchanged.
 */
export const boxDimensionInputSchema = z
  .string()
  .trim()
  .regex(/^\d{1,9}(\.\d{1,3})?$/, 'Use up to 9 digits and 3 decimal places')
  .nullable()
  .default(null);

/**
 * A single attribute row, reusing the public read shape but with length bounds —
 * the read contract trusts stored data, the write contract validates input.
 */
const attributeInputSchema = productAttributeSchema.extend({
  key: z.string().trim().max(ATTRIBUTE_NAME_MAX_LENGTH),
  value: z.string().trim().max(ATTRIBUTE_VALUE_MAX_LENGTH),
});

/**
 * A product this one is sold together with (FR-SET-01), as the editor lists it:
 * the handle a save sends back plus the name that identifies it on screen.
 *
 * The two flags are why a pairing survives a counterpart being taken off the
 * storefront. Neither is a reason to drop the row — a soft delete is reversible
 * and an unpublished product is usually one still being prepared — so the
 * editor marks the counterpart rather than losing the link the admin made.
 */
export const pairedProductSchema = z
  .object({
    slug: z.string(),
    name: z.string(),
    /** Soft-deleted; the storefront does not show it. */
    deleted: z.boolean(),
    /** Never published, or taken off the storefront again. */
    unpublished: z.boolean(),
  })
  .strict();
export type PairedProduct = z.infer<typeof pairedProductSchema>;

/**
 * A variant as the editor writes it (FR-CAT-11). The id is the editor's own,
 * minted when the variant is added, so a rename keeps every picture pointing
 * at it; the storefront never sees it.
 */
export const productVariantInputSchema = z
  .object({
    id: z.uuid(),
    name: z.string().trim().min(1).max(PRODUCT_VARIANT_NAME_MAX_LENGTH),
    unavailable: z.boolean().default(false),
  })
  .strict();
export type ProductVariantInput = z.infer<typeof productVariantInputSchema>;

/** A gallery picture as the editor writes it: the stored pair, and the
 * variant it shows, if any. */
export const productImageInputSchema = catalogImageSchema
  .extend({ variantId: z.uuid().nullable().default(null) })
  .strict();
export type ProductImageInput = z.infer<typeof productImageInputSchema>;

/**
 * What create and update accept.
 *
 * `slug` is optional and defaults to stability: omitted on create → the server
 * derives one from the name by transliteration (`slugify`); omitted on update →
 * the existing slug is kept, so a rename never silently changes the URL
 * (a changed URL breaks links/SEO). Providing it is a deliberate override
 * (a hand-picked or corrected slug); a collision with another product is a 409.
 *
 * `sourceId` is optional; the server mints a `manual:<uuid>` when omitted and
 * rejects a collision with 409.
 */
export const productInputSchema = z
  .object({
    name: z.string().trim().min(1).max(PRODUCT_NAME_MAX_LENGTH),
    /** Optional slug override; see the schema doc. */
    slug: slugSchema.optional(),
    /**
     * The default list's price for one piece, or null for a product nothing
     * has priced yet — a product imported before its prices were. Saving null
     * is allowed and takes the product off the storefront (FR-ADM-06): a page
     * cannot show a visitor a price that does not exist. Zero is not that
     * state spelled differently — see `priceInputMinorSchema`.
     */
    priceMinor: priceInputMinorSchema.nullable(),
    /** The single owning category (FR-CAT-05); picked from the admin tree. */
    categoryId: z.uuid(),
    /** Sanitized server-side before storage, same discipline as page bodies.
     * May be empty. The editor is limited to PRODUCT_RICH_TEXT_TAGS. */
    descriptionHtml: z.string().max(PRODUCT_DESCRIPTION_MAX_LENGTH).default(''),
    attributes: z
      .array(attributeInputSchema)
      .max(PRODUCT_ATTRIBUTES_MAX)
      .default([]),
    /**
     * The parts one piece is made of, where it is sold as a set (FR-CAT-10):
     * none, or two to three distinct short words. An attribute key naming one
     * of them in parentheses — "Colour (cup)" — is stored against that part.
     */
    parts: z
      .array(z.string().trim().max(PRODUCT_PART_MAX_LENGTH))
      .max(PRODUCT_PARTS_MAX)
      .refine(
        isValidPartList,
        'A set names two or three distinct parts, without + or parentheses',
      )
      .default([]),
    /** Ordered gallery; array order is display order. Each is a stored
     * `{ full, thumb }` media pair (ADR 0021/0022), and names at most one of
     * the variants below. */
    images: z
      .array(productImageInputSchema)
      .max(PRODUCT_IMAGES_MAX)
      .default([]),
    /**
     * The variants the pictures show, in the order the storefront lists them
     * (FR-CAT-11). Maintained here only — no exchange reads or writes them.
     */
    variants: z
      .array(productVariantInputSchema)
      .max(PRODUCT_VARIANTS_MAX)
      .refine(hasDistinctVariants, 'Each variant needs a name of its own')
      .default([]),
    /** Private sync key. Admin-settable to pre-assign a legacy key for future
     * file reconciliation; omit to let the server generate `manual:<uuid>`. */
    sourceId: z.string().trim().min(1).max(SOURCE_ID_MAX_LENGTH).optional(),
    /**
     * The product's tier overrides, in full: what is sent replaces what is
     * stored, so dropping an entry removes that tier's override and returns it
     * to the base price. An unknown `tierId` is a 404, like an unknown
     * category.
     */
    tierPrices: z
      .array(productTierPriceSchema)
      .max(PRODUCT_TIER_PRICES_MAX)
      .refine(
        (entries) =>
          new Set(entries.map((e) => e.tierId)).size === entries.length,
        'A tier can only be priced once',
      )
      .default([]),
    /** Null means the product is not sold in that unit. */
    piecesPerPack: z.number().int().positive().nullable().default(null),
    packsPerBox: z.number().int().positive().nullable().default(null),
    /** The smallest quantity the shop will sell: under one pack, or a whole
     * number of packs. Not the increment — a piece quantity moves by one pack
     * unless the minimum is under one, in which case packs are opened. */
    minPieceQty: z.number().int().positive().default(1),
    boxVolume: boxDimensionInputSchema,
    boxWeight: boxDimensionInputSchema,
    /** How many boxes the product ships as; informational (FR-UNIT-11). */
    boxCount: z.number().int().positive().default(1),
    /** Offered first to the main page's row (FR-CAT-09). Never shown as such
     * on the storefront. */
    featured: z.boolean().default(false),
    /** Whether a cart line for this product may carry a note (FR-CART-08). */
    lineNoteEnabled: z.boolean().default(false),
    /** What to ask the customer for; null falls back to the app-wide wording. */
    lineNotePrompt: z
      .string()
      .trim()
      .min(1)
      .max(PRODUCT_LINE_NOTE_PROMPT_MAX_LENGTH)
      .nullable()
      .default(null),
    /**
     * Pieces on hand (FR-STOCK-01). Null means this product's stock is not
     * tracked, which is the default and shows the customer nothing. Not
     * bounded below: a stocktake correction may leave it negative, and that
     * reads as out of stock rather than being refused.
     */
    stockPieces: z.number().int().nullable().default(null),
    /** This product's own "few left" line, overriding the box/pack/config
     * ladder (FR-STOCK-02). */
    lowStockThresholdPieces: z
      .number()
      .int()
      .positive()
      .nullable()
      .default(null),
    /** The product's own tax rate, a percent (NFR-LEGAL-11). Null is the
     * deployment's default. */
    taxRate: taxRateSchema.nullable().default(null),
    /**
     * The products this one is sold together with (FR-SET-01), by slug — the
     * handle the admin API addresses a product by everywhere else.
     *
     * The whole set, like `tierPrices`: what is sent replaces what is stored,
     * and a pairing dropped here is dropped from the counterpart too, because
     * one edge is one row. An unknown slug is a 404.
     */
    pairedSlugs: z
      .array(z.string())
      .max(PRODUCT_PAIRINGS_MAX)
      .refine(
        (slugs) => new Set(slugs).size === slugs.length,
        'A product can only be paired once',
      )
      .default([]),
    /**
     * The documents shown on this product (FR-DOC-02), by id — a document has
     * no slug, and its title is not unique.
     *
     * The whole set from this product's side, like `pairedSlugs`: what is sent
     * replaces what is stored *for this product*, and the document keeps every
     * other product it is on. An unknown id is a 404.
     */
    documentIds: z
      .array(z.uuid())
      .max(PRODUCT_DOCUMENTS_MAX)
      .refine(
        (ids) => new Set(ids).size === ids.length,
        'A document can only be linked once',
      )
      .default([]),
  })
  .strict()
  .refine(
    (input) => input.packsPerBox === null || input.piecesPerPack !== null,
    {
      message: 'A box needs a pack size',
      path: ['packsPerBox'],
    },
  )
  .refine(
    (input) =>
      input.packsPerBox !== null || (!input.boxVolume && !input.boxWeight),
    { message: 'Box dimensions need a box', path: ['boxVolume'] },
  )
  .refine((input) => input.packsPerBox !== null || input.boxCount === 1, {
    message: 'A box count needs a box',
    path: ['boxCount'],
  })
  .refine((input) => picturesNameKnownVariants(input.images, input.variants), {
    message: 'A picture names a variant the product does not list',
    path: ['images'],
  })
  .refine((input) => input.lineNoteEnabled || input.lineNotePrompt === null, {
    message: 'A note prompt needs the note enabled',
    path: ['lineNotePrompt'],
  })
  .refine(
    (input) =>
      input.lowStockThresholdPieces === null || input.stockPieces !== null,
    {
      message: 'A low-stock threshold needs a stock figure',
      path: ['lowStockThresholdPieces'],
    },
  )
  // The minimum sits with the pack or under it, never across it — mirrors
  // products_minimum_fits_packs.
  .refine(minimumFitsPacks, {
    message:
      'The minimum quantity must be under one pack or a whole number of packs',
    path: ['minPieceQty'],
  });
export type ProductInput = z.infer<typeof productInputSchema>;

/**
 * The full editable product the admin editor loads and re-renders after a save —
 * the overlay and file-owned fields plus the admin-only handles.
 */
export const adminProductSchema = z
  .object({
    slug: z.string(),
    name: z.string(),
    /** The default list's price, or null where no list prices this product. */
    priceMinor: priceMinorSchema.nullable(),
    categoryId: z.uuid(),
    sourceId: z.string(),
    descriptionHtml: z.string(),
    /** Keys as written — "Colour (cup)" — so a save sends them back unchanged. */
    attributes: z.array(productAttributeSchema),
    parts: z.array(z.string()),
    images: z.array(
      catalogImageSchema.extend({ variantId: z.string().nullable() }).strict(),
    ),
    variants: z.array(
      z
        .object({ id: z.string(), name: z.string(), unavailable: z.boolean() })
        .strict(),
    ),
    /** Only the tiers priced away from the default list; never it. */
    tierPrices: z.array(productTierPriceSchema),
    piecesPerPack: z.number().int().positive().nullable(),
    packsPerBox: z.number().int().positive().nullable(),
    minPieceQty: z.number().int().positive(),
    boxVolume: z.string().nullable(),
    boxWeight: z.string().nullable(),
    boxCount: z.number().int().positive(),
    featured: z.boolean(),
    lineNoteEnabled: z.boolean(),
    lineNotePrompt: z.string().nullable(),
    /** Staff-facing, and the reason the editor can be trusted to read back what
     * it wrote: the state below is recomputed from these in the same save. */
    stockPieces: z.number().int().nullable(),
    lowStockThresholdPieces: z.number().int().positive().nullable(),
    taxRate: z.number().nullable(),
    /** Read-only — derived from the two above and the packaging, never sent. */
    availability: availabilitySchema,
    /** The counterparts, named — a save sends `pairedSlugs` back (FR-SET-01). */
    pairings: z.array(pairedProductSchema),
    /** The documents shown on it — a save sends `documentIds` back
     * (FR-DOC-02). */
    documents: z.array(linkedDocumentSchema),
    /** ISO 8601, or null when live. Drives the greyed-out admin styling. */
    deletedAt: z.iso.datetime().nullable(),
    /** Deleted by a sync run rather than by a person (FR-ADM-10): only a run
     * brings it back while the catalog is externally owned. False while not
     * deleted. */
    deletedByRun: z.boolean(),
    /** Null while the product is not on the storefront (FR-ADM-06). */
    publishedAt: z.iso.datetime().nullable(),
    updatedAt: z.iso.datetime(),
  })
  .strict();
export type AdminProduct = z.infer<typeof adminProductSchema>;

/** A lighter row for the admin grid (includes deleted; one thumb for preview).
 * Carries `sourceId` and `updatedAt` because the grid can filter and sort on
 * both — a column the admin can order by has to be one they can also see. */
export const adminProductListItemSchema = z
  .object({
    slug: z.string(),
    name: z.string(),
    /** Null where no list prices this product — it cannot be published. */
    priceMinor: priceMinorSchema.nullable(),
    categoryId: z.uuid(),
    sourceId: z.string(),
    thumb: z.string().nullable(),
    /** The same badge the storefront shows, so a grid row says what a visitor
     * sees without opening it. */
    availability: availabilitySchema,
    /**
     * The figure behind the badge (FR-STOCK-01), null where the stock is
     * untracked. Staff-facing, which this grid is: the badge alone answers
     * "can it be sold", and a manager restocking needs "how many" — and going
     * into the editor row by row to read one number is not a way to work.
     */
    stockPieces: z.number().int().nullable(),
    /** What keeps it incomplete (FR-ADM-20), empty when nothing does — so a
     * row filtered to "incomplete" says why it is there. */
    gaps: z.array(z.enum(INCOMPLETE_GAPS)),
    /** What it carries beyond a name and a price, drawn as glyphs. */
    features: z.array(z.enum(PRODUCT_FEATURES)),
    deletedAt: z.iso.datetime().nullable(),
    /** As on the full product: who undoes the deletion. */
    deletedByRun: z.boolean(),
    /** On some order, which rules out deleting it permanently (FR-ADM-21). */
    ordered: z.boolean(),
    /** Null while the product is not on the storefront (FR-ADM-06). */
    publishedAt: z.iso.datetime().nullable(),
    updatedAt: z.iso.datetime(),
  })
  .strict();
export type AdminProductListItem = z.infer<typeof adminProductListItemSchema>;

/**
 * Which publication states the grid shows (FR-ADM-05). `all` is the default:
 * the catalog, live and unpublished, rather than the storefront's implicit
 * "live only". `live` means on the storefront, and `unpublished` is the review
 * queue a sync fills (FR-ADM-06). `deleted` is the archive (FR-ADM-22): out of
 * the catalog, so never part of `all`, and the one place deleted rows appear.
 * An unpriced product is a content gap, not a state (FR-ADM-20).
 */
export const adminProductStateSchema = z.enum([
  'all',
  'live',
  'unpublished',
  'deleted',
]);
export type AdminProductState = z.infer<typeof adminProductStateSchema>;

/**
 * Which stock states the grid shows (FR-ADM-05) — the three of FR-STOCK-02,
 * filtered on the stored state rather than on the count, so the grid and the
 * badge can never disagree about where a product's threshold falls.
 *
 * Absent is "any", which includes the untracked. There is deliberately no
 * "untracked" choice: it is a fourth thing the storefront never shows, and
 * nobody has asked the catalog that question yet.
 */
export const adminProductAvailabilityFilterSchema = z.enum(
  PRODUCT_AVAILABILITIES,
);

/**
 * Grid sort keys (FR-ADM-05): the storefront's name/price pairs, plus recency
 * for "what did I just touch", plus relevance.
 *
 * `relevance` is the default and does double duty: with a search box entry it
 * ranks by match score, and with an empty box there is nothing to score against
 * so it degrades to name order — which is what an unsearched grid wants anyway.
 * That way the UI never has to switch the sort key when a query appears.
 */
export const adminProductSortSchema = z.enum([
  ...SEARCH_SORTS,
  /** Least recently updated first; `updated_desc` is the useful one. */
  'updated',
  'updated_desc',
  /**
   * By what the row needs: unpublished first (somebody has to look at it),
   * then what is live, then what has been deleted. It is also what an
   * unscored `relevance` falls back to, so opening the grid puts the arrivals
   * a sync left unpublished at the top.
   */
  'state',
  'state_desc',
]);
export type AdminProductSort = z.infer<typeof adminProductSortSchema>;

/**
 * A query parameter holding a set of values. A query string has no array type,
 * so a single entry arrives bare and more arrive as a list — read both as a
 * list, as the storefront's attribute filter does.
 */
function listParam<const T extends readonly [string, ...string[]]>(values: T) {
  return z
    .union([z.enum(values), z.array(z.enum(values))])
    .optional()
    .transform((value) =>
      value === undefined ? [] : Array.isArray(value) ? value : [value],
    );
}

/**
 * Admin grid query (FR-ADM-05): 1-based page, publication state, category, a
 * free-text box and a sort.
 *
 * `q` matches the product name with the same matcher the storefront search uses
 * (word-order independent, typo tolerant) *or* the private `sourceId` as a
 * substring — the admin either remembers roughly what a product is called or
 * has the sync key in hand, and one box serves both.
 */
export const adminProductListQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  /** The category and everything beneath it, as the storefront listing reads
   * it (FR-ADM-19). */
  categoryId: z.uuid().optional(),
  /**
   * `direct` narrows `categoryId` to the products filed in it, leaving out its
   * subcategories' — the way to find a product left in a parent. Ignored
   * without a `categoryId`.
   */
  categoryScope: z.enum(['subtree', 'direct']).optional(),
  state: adminProductStateSchema.optional().default('all'),
  /** One of the three stock states, or absent for any (FR-STOCK-02). */
  availability: adminProductAvailabilityFilterSchema.optional(),
  q: z.string().max(SEARCH_QUERY_MAX_LENGTH).optional().default(''),
  sort: adminProductSortSchema.optional().default('relevance'),
  /**
   * Where the attribute inventory's drill-down lands (FR-ADM-05, FR-ATTR-09):
   * the products carrying one attribute key, optionally narrowed to one of its
   * values. Matched exactly, like everything about attribute text. The value is
   * ignored without a key — "products with the value Blue" is not a question
   * the inventory asks.
   */
  attributeKey: z.string().max(ATTRIBUTE_NAME_MAX_LENGTH).optional(),
  attributeValue: z.string().max(ATTRIBUTE_VALUE_MAX_LENGTH).optional(),
  /**
   * The products carrying a price of their own for one tier — where the tier
   * list's price count leads. "Which products did we agree a rate with this
   * group on?" has no other way of being asked, and it is the question behind
   * every review of a tier.
   */
  tierId: z.uuid().optional(),
  /**
   * Which side of `tierId` to show: the products that list prices, or the ones
   * it does not. The gap is the question a tier review actually ends on —
   * "wholesale prices 98 of our 100 products, which two are missing?" — and it
   * has no answer anywhere else. Ignored without a `tierId`.
   */
  tierPriced: z.enum(['yes', 'no']).optional(),
  /**
   * The products one document is shown on — where the document list's product
   * count leads (FR-DOC-02). Like the tier and attribute narrowings it has no
   * column of its own, because a document is not something a product row
   * says anything about.
   */
  documentId: z.uuid().optional(),
  /**
   * What the product's own content lacks (FR-ADM-20), each entry one gap or
   * `incomplete` for any of the four every product page needs. Several
   * entries must all hold, and so must `has` beside them: "featured, without
   * a picture" is one question.
   */
  missing: listParam(PRODUCT_GAP_FILTERS),
  /** What the product carries beyond a name and a price; all must hold. */
  has: listParam(PRODUCT_FEATURES),
});
export type AdminProductListQuery = z.infer<typeof adminProductListQuerySchema>;

/** Saving a product can collide on either unique column, or name a gone tier,
 * a gone counterpart or a gone document. */
const productWriteErrors = {
  'catalog-externally-owned': ownershipErrors['catalog-externally-owned'],
  'category-not-found': CATALOG_ERRORS['category-not-found'],
  'tier-not-found': CATALOG_ERRORS['tier-not-found'],
  'paired-product-not-found': CATALOG_ERRORS['paired-product-not-found'],
  'document-not-found': CATALOG_ERRORS['document-not-found'],
  'pairing-self': CATALOG_ERRORS['pairing-self'],
  'slug-taken': CATALOG_ERRORS['slug-taken'],
  'source-id-taken': CATALOG_ERRORS['source-id-taken'],
  'slug-or-source-id-taken': CATALOG_ERRORS['slug-or-source-id-taken'],
} as const;

/**
 * Every product route can be rejected by the auth guards; declared once
 * here rather than on each route.
 */
const admin = oc.errors(commonAuthErrors);

export const adminProductsContract = {
  listProducts: admin
    .route({
      method: 'GET',
      path: '/admin/catalog/products',
      inputStructure: 'detailed',
      summary: 'List products for the admin grid',
    })
    .input(z.object({ query: adminProductListQuerySchema }))
    .output(
      z
        .object({
          items: z.array(adminProductListItemSchema),
          /**
           * Set only when nothing matched a search outside the archive: how
           * many deleted products the same search and filters do match
           * (FR-ADM-22). A product looked up by name would otherwise seem
           * not to exist.
           */
          deletedMatches: z.number().int().positive().optional(),
          pagination: z
            .object({
              page: z.number().int().positive(),
              pageSize: z.number().int().positive(),
              total: z.number().int().nonnegative(),
              totalPages: z.number().int().nonnegative(),
            })
            .strict(),
        })
        .strict(),
    ),

  getProduct: admin
    .route({
      method: 'GET',
      path: '/admin/catalog/products/{slug}',
      inputStructure: 'detailed',
      summary: 'Get a product in editable form (admin)',
    })
    .errors({ 'product-not-found': CATALOG_ERRORS['product-not-found'] })
    .input(z.object({ params: z.object({ slug: z.string() }) }))
    .output(adminProductSchema),

  createProduct: admin
    .route({
      method: 'POST',
      path: '/admin/catalog/products',
      successStatus: 201,
      inputStructure: 'detailed',
      summary: 'Create a product (admin; body sanitized, slug generated)',
    })
    .errors(productWriteErrors)
    .input(z.object({ body: productInputSchema }))
    .output(adminProductSchema),

  updateProduct: admin
    .route({
      method: 'PUT',
      path: '/admin/catalog/products/{slug}',
      inputStructure: 'detailed',
      summary: 'Replace a product (admin; slug stays fixed)',
    })
    .errors({
      'product-not-found': CATALOG_ERRORS['product-not-found'],
      ...productWriteErrors,
    })
    .input(
      z.object({
        params: z.object({ slug: z.string() }),
        body: productInputSchema,
      }),
    )
    .output(adminProductSchema),

  deleteProduct: admin
    .route({
      method: 'DELETE',
      // No body; soft delete only (sets deletedAt). Refused for a product on
      // the storefront: it is unpublished first (FR-ADM-01). Open while the
      // catalog is externally owned — whether a product is shown is the shop's.
      path: '/admin/catalog/products/{slug}',
      inputStructure: 'detailed',
      summary: 'Soft-delete a product (admin; reversible via restore)',
    })
    .errors({
      'product-not-found': CATALOG_ERRORS['product-not-found'],
      'product-published': CATALOG_ERRORS['product-published'],
    })
    .input(z.object({ params: z.object({ slug: z.string() }) }))
    .output(adminProductSchema),

  restoreProduct: admin
    .route({
      method: 'POST',
      path: '/admin/catalog/products/{slug}/restore',
      inputStructure: 'detailed',
      summary: 'Restore a soft-deleted product (admin)',
    })
    // `catalog-externally-owned` for a product a run deleted while the catalog
    // is owned: each side undoes only its own deletion (FR-ADM-10).
    .errors({
      'product-not-found': CATALOG_ERRORS['product-not-found'],
      'catalog-externally-owned': ownershipErrors['catalog-externally-owned'],
    })
    .input(z.object({ params: z.object({ slug: z.string() }) }))
    .output(adminProductSchema),

  /**
   * A product's page for an admin, whether or not the storefront shows it
   * (FR-ADM-06) — what the product route falls back to when the public read
   * answers that there is no such product.
   */
  getProductPage: admin
    .route({
      method: 'GET',
      path: '/admin/catalog/products/{slug}/page',
      inputStructure: 'detailed',
      summary: 'Read any product as its page shows it, and why it is hidden',
    })
    .errors({ 'product-not-found': CATALOG_ERRORS['product-not-found'] })
    .input(z.object({ params: z.object({ slug: z.string() }) }))
    .output(productPageSchema),

  /**
   * Remove a deleted product for good (FR-ADM-21), with what belongs only to
   * it — prices, attributes, pairings, document links. Its picture files are
   * left to the unreferenced-upload sweep. Refused for one somebody ordered,
   * and while the catalog is externally owned for one an admin deleted: the
   * source still sends it, and it would only arrive again as new.
   */
  purgeProduct: admin
    .route({
      method: 'DELETE',
      path: '/admin/catalog/products/{slug}/permanent',
      inputStructure: 'detailed',
      summary: 'Delete a soft-deleted product permanently (admin)',
    })
    .errors({
      'product-not-found': CATALOG_ERRORS['product-not-found'],
      'product-not-deleted': CATALOG_ERRORS['product-not-deleted'],
      'product-ordered': CATALOG_ERRORS['product-ordered'],
      'catalog-externally-owned': ownershipErrors['catalog-externally-owned'],
    })
    .input(z.object({ params: z.object({ slug: z.string() }) }))
    .output(z.object({ slug: z.string(), name: z.string() }).strict()),

  /**
   * Put a product on the storefront, or take it off (FR-ADM-06).
   *
   * The body names the state rather than the action, because this is one
   * reversible switch rather than a pair. Publishing a deleted product is
   * refused — it is restored first — but the two stay independent in storage,
   * so restoring leaves publication as it was.
   */
  setProductPublished: admin
    .route({
      method: 'PATCH',
      path: '/admin/catalog/products/{slug}/published',
      inputStructure: 'detailed',
      summary: 'Publish or unpublish a product (admin)',
    })
    .errors({
      'product-not-found': CATALOG_ERRORS['product-not-found'],
      'product-has-no-price': CATALOG_ERRORS['product-has-no-price'],
      'product-deleted': CATALOG_ERRORS['product-deleted'],
    })
    .input(
      z.object({
        params: z.object({ slug: z.string() }),
        body: z.object({ published: z.boolean() }).strict(),
      }),
    )
    .output(adminProductSchema),

  /**
   * The live products this one is the last counterpart on sale for: the ones
   * whose pairing stops applying if it is unpublished, since a pairing counts
   * only counterparts a customer could add (FR-SET-04). Empty for a product
   * that is not on sale itself. Asked by the unpublish confirmation.
   */
  listStrandedPairings: admin
    .route({
      method: 'GET',
      path: '/admin/catalog/products/{slug}/stranded-pairings',
      inputStructure: 'detailed',
      summary:
        'List live products left with no counterpart if this one is unpublished (admin)',
    })
    .errors({ 'product-not-found': CATALOG_ERRORS['product-not-found'] })
    .input(z.object({ params: z.object({ slug: z.string() }) }))
    .output(
      z
        .object({
          items: z.array(
            z.object({ slug: z.string(), name: z.string() }).strict(),
          ),
        })
        .strict(),
    ),

  listHiddenProducts: admin
    .route({
      method: 'GET',
      // Powers the storefront edit-mode overlay under a category grid: what is
      // in this subtree but not on the storefront — unpublished (Pattern A,
      // same aggregation as the public grid). A deleted product is out of the
      // catalog (FR-ADM-22) and is restored from the admin product list. Without
      // it an admin browsing a category sees a catalogue that looks complete and
      // is not. Unpaginated: a category's hidden set is small. Fetched only when
      // edit mode is on, so the public read path stays untouched.
      path: '/admin/catalog/categories/{slug}/hidden-products',
      inputStructure: 'detailed',
      summary:
        'List products in a category subtree that the storefront hides (admin)',
    })
    .errors({ 'category-not-found': CATALOG_ERRORS['category-not-found'] })
    .input(z.object({ params: z.object({ slug: z.string() }) }))
    .output(z.object({ items: z.array(hiddenProductSchema) }).strict()),
};
