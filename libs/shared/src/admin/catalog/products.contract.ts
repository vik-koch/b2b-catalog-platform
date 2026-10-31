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
  type ProductErrorCode,
} from './products';
import { commonAuthErrors } from '../../lib/core/api-error';
import { ownershipErrors } from '../../sync/ownership-constants';
import {
  availabilitySchema,
  catalogImageSchema,
  priceMinorSchema,
  productAttributeSchema,
  productVariantSchema,
} from '../../core/catalog/catalog.contract';
import { SEARCH_SORTS } from '../../core/catalog/product-sort';
import { searchQueryParamSchema } from '../../core/catalog/search.contract';
import { listParam } from '../../platform/list-param.contract';
import {
  pageParamSchema,
  paginationSchema,
} from '../../platform/pagination.contract';
import {
  hiddenProductSchema,
  productPageSchema,
} from '../../core/catalog/edit-mode.contract';
import { PRODUCT_DOCUMENTS_MAX } from './documents';
import { linkedDocumentSchema } from './documents.contract';
import {
  linkedProductSchema,
  productRefSchema,
} from './linked-product.contract';
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

/**
 * A price as it is written. Zero is refused: a product that costs nothing has
 * no price, which the catalog says by storing none. Reads keep
 * `priceMinorSchema`, so zeros stored before this rule still render.
 */
export const priceInputMinorSchema = z.number().int().positive();

/**
 * One tier's price for this product (FR-AUTH-05), by id rather than sync key:
 * an id survives a key renamed mid-edit. The default list is not among them:
 * it is the product's own `priceMinor`. A tier absent here falls back to the
 * default list, so a tier carries only its exceptions.
 */
export const productTierPriceSchema = z
  .object({
    tierId: z.uuid(),
    priceMinor: priceInputMinorSchema,
  })
  .strict();
export type ProductTierPrice = z.infer<typeof productTierPriceSchema>;

/** A box dimension as the decimal string a `numeric(12,3)` column holds, so
 * the digits an admin typed survive unchanged. */
export const boxDimensionInputSchema = z
  .string()
  .trim()
  .regex(/^\d{1,9}(\.\d{1,3})?$/, 'Use up to 9 digits and 3 decimal places')
  .nullable()
  .default(null);

/** The read shape with bounds: a read trusts stored data, a write does not. */
const attributeInputSchema = productAttributeSchema.extend({
  key: z.string().trim().max(ATTRIBUTE_NAME_MAX_LENGTH),
  value: z.string().trim().max(ATTRIBUTE_VALUE_MAX_LENGTH),
});

/**
 * A variant as the editor writes it (FR-CAT-11). The editor mints the id when
 * the variant is added, so a rename keeps every picture pointing at it; the
 * storefront never sees it.
 */
export const productVariantInputSchema = z
  .object({
    id: z.uuid(),
    name: z.string().trim().min(1).max(PRODUCT_VARIANT_NAME_MAX_LENGTH),
    unavailable: z.boolean().default(false),
  })
  .strict();
export type ProductVariantInput = z.infer<typeof productVariantInputSchema>;

/** A gallery picture as the editor writes it, with the variant it shows. */
export const productImageInputSchema = catalogImageSchema
  .extend({ variantId: z.uuid().nullable().default(null) })
  .strict();
export type ProductImageInput = z.infer<typeof productImageInputSchema>;

/** What create and update accept. */
export const productInputSchema = z
  .object({
    name: z.string().trim().min(1).max(PRODUCT_NAME_MAX_LENGTH),
    /**
     * Omitted on create, derived from the name; omitted on update, kept, so a
     * rename never moves the URL. Sent, a deliberate override.
     */
    slug: slugSchema.optional(),
    /**
     * The default list's price for one piece, or null for a product nothing has
     * priced yet. Saving null takes the product off the storefront (FR-ADM-06):
     * a page cannot show a price that does not exist.
     */
    priceMinor: priceInputMinorSchema.nullable(),
    /** The single owning category (FR-CAT-05). */
    categoryId: z.uuid(),
    /** Sanitized to `PRODUCT_RICH_TEXT_TAGS` before it is stored. */
    descriptionHtml: z.string().max(PRODUCT_DESCRIPTION_MAX_LENGTH).default(''),
    attributes: z
      .array(attributeInputSchema)
      .max(PRODUCT_ATTRIBUTES_MAX)
      .default([]),
    /**
     * The parts one piece is made of, for a set (FR-CAT-10). An attribute key
     * naming one in parentheses, "Colour (cup)", is stored against that part.
     */
    parts: z
      .array(z.string().trim().max(PRODUCT_PART_MAX_LENGTH))
      .max(PRODUCT_PARTS_MAX)
      .refine(
        isValidPartList,
        'A set names two or three distinct parts, without + or parentheses',
      )
      .default([]),
    /** In display order; each names at most one of the variants. */
    images: z
      .array(productImageInputSchema)
      .max(PRODUCT_IMAGES_MAX)
      .default([]),
    /** In the storefront's order (FR-CAT-11). No exchange reads or writes
     * them. */
    variants: z
      .array(productVariantInputSchema)
      .max(PRODUCT_VARIANTS_MAX)
      .refine(hasDistinctVariants, 'Each variant needs a name of its own')
      .default([]),
    /** Private sync key, settable to pre-assign the source system's key.
     * Omitted, the server mints `manual:<uuid>`. */
    sourceId: z.string().trim().min(1).max(SOURCE_ID_MAX_LENGTH).optional(),
    /** The whole set: what is sent replaces what is stored, so a dropped
     * entry returns that tier to the default price. */
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
    /** The smallest quantity the shop will sell, not the increment
     * (`pieceStep`). */
    minPieceQty: z.number().int().positive().default(1),
    boxVolume: boxDimensionInputSchema,
    boxWeight: boxDimensionInputSchema,
    /** How many boxes the product ships as; informational (FR-UNIT-11). */
    boxCount: z.number().int().positive().default(1),
    /** Offered first to the main page's row (FR-CAT-09), never marked as such
     * on the storefront. */
    featured: z.boolean().default(false),
    /** Whether a cart line for this product may carry a note (FR-CART-08). */
    lineNoteEnabled: z.boolean().default(false),
    /** Null falls back to the storefront text. */
    lineNotePrompt: z
      .string()
      .trim()
      .min(1)
      .max(PRODUCT_LINE_NOTE_PROMPT_MAX_LENGTH)
      .nullable()
      .default(null),
    /**
     * Pieces on hand (FR-STOCK-01), null where untracked. Not bounded below: a
     * stocktake correction may leave it negative, which reads as out of stock.
     */
    stockPieces: z.number().int().nullable().default(null),
    /** Overrides `lowStockThreshold`'s box, pack and default (FR-STOCK-02). */
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
     * The products this one is sold together with (FR-SET-01). The whole set,
     * like `tierPrices`; a pairing dropped here is dropped from the counterpart
     * too, because one edge is one row.
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
     * The documents shown on this product (FR-DOC-02), by id: a document has no
     * slug. The whole set from this product's side; the document keeps every
     * other product it is on.
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
  .refine(minimumFitsPacks, {
    message:
      'The minimum quantity must be under one pack or a whole number of packs',
    path: ['minPieceQty'],
  });
export type ProductInput = z.infer<typeof productInputSchema>;

/** The editable product the editor loads, and re-renders after a save. */
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
    variants: z.array(productVariantSchema.extend({ id: z.string() }).strict()),
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
    /** `availability` is recomputed from these in the same save. */
    stockPieces: z.number().int().nullable(),
    lowStockThresholdPieces: z.number().int().positive().nullable(),
    taxRate: z.number().nullable(),
    /** Derived, never sent. */
    availability: availabilitySchema,
    /** A save sends these back as `pairedSlugs`. */
    pairings: z.array(linkedProductSchema),
    /** A save sends these back as `documentIds`. */
    documents: z.array(linkedDocumentSchema),
    /** Null unless soft-deleted. */
    deletedAt: z.iso.datetime().nullable(),
    /** Deleted by a sync run rather than a person: while the catalog is
     * externally owned, only a run brings it back (FR-ADM-10). */
    deletedByRun: z.boolean(),
    /** Null while the product is not on the storefront (FR-ADM-06). */
    publishedAt: z.iso.datetime().nullable(),
    updatedAt: z.iso.datetime(),
  })
  .strict();
export type AdminProduct = z.infer<typeof adminProductSchema>;

/** A row in the admin grid. It carries `sourceId` and `updatedAt` because the
 * grid searches and sorts by them, and a sort key should be visible. */
export const adminProductListItemSchema = z
  .object({
    slug: z.string(),
    name: z.string(),
    /** Null where no list prices it, which keeps it off the storefront. */
    priceMinor: priceMinorSchema.nullable(),
    categoryId: z.uuid(),
    sourceId: z.string(),
    thumb: z.string().nullable(),
    /** The badge a visitor sees. */
    availability: availabilitySchema,
    /** The figure behind the badge (FR-STOCK-01), for restocking from the
     * grid. Null where untracked. */
    stockPieces: z.number().int().nullable(),
    /** What keeps it incomplete (FR-ADM-20), so a row says why it is. */
    gaps: z.array(z.enum(INCOMPLETE_GAPS)),
    /** What it carries beyond a name and a price, drawn as glyphs. */
    features: z.array(z.enum(PRODUCT_FEATURES)),
    deletedAt: z.iso.datetime().nullable(),
    /** See `adminProductSchema`. */
    deletedByRun: z.boolean(),
    /** On some order: never deleted permanently (FR-ADM-21). */
    ordered: z.boolean(),
    /** Null while the product is not on the storefront (FR-ADM-06). */
    publishedAt: z.iso.datetime().nullable(),
    updatedAt: z.iso.datetime(),
  })
  .strict();
export type AdminProductListItem = z.infer<typeof adminProductListItemSchema>;

/**
 * Which publication states the grid shows (FR-ADM-05). `all` is the catalog,
 * live and unpublished; `unpublished` is the review queue a sync fills
 * (FR-ADM-06). `deleted` is the archive (FR-ADM-22), never part of `all`.
 */
export const adminProductStateSchema = z.enum([
  'all',
  'live',
  'unpublished',
  'deleted',
]);
export type AdminProductState = z.infer<typeof adminProductStateSchema>;

/**
 * Which stock state the grid shows (FR-ADM-05), filtered on the stored state
 * rather than the count, so grid and badge agree. Absent is any, untracked
 * included.
 */
export const adminProductAvailabilityFilterSchema = z.enum(
  PRODUCT_AVAILABILITIES,
);

/**
 * Grid sort keys (FR-ADM-05). `relevance`, the default, ranks a search and
 * falls back to `state` without one, so the UI never switches the key when a
 * query appears.
 */
export const adminProductSortSchema = z.enum([
  ...SEARCH_SORTS,
  /** Least recently updated first; `updated_desc` is the useful one. */
  'updated',
  'updated_desc',
  /** Unpublished first, since somebody has to look at it, then live, then
   * deleted. */
  'state',
  'state_desc',
]);
export type AdminProductSort = z.infer<typeof adminProductSortSchema>;

/** The admin grid's query (FR-ADM-05). */
export const adminProductListQuerySchema = z.object({
  page: pageParamSchema,
  /** The category and everything beneath it (FR-ADM-19). */
  categoryId: z.uuid().optional(),
  /** `direct` leaves out the subcategories' products: the way to find one
   * left in a parent. Ignored without `categoryId`. */
  categoryScope: z.enum(['subtree', 'direct']).optional(),
  state: adminProductStateSchema.optional().default('all'),
  /** One of the three stock states, or absent for any (FR-STOCK-02). */
  availability: adminProductAvailabilityFilterSchema.optional(),
  /** The name, as the storefront search matches it, or the `sourceId` as a
   * substring: one box for either handle an admin has. */
  q: searchQueryParamSchema,
  sort: adminProductSortSchema.optional().default('relevance'),
  /** The products carrying one attribute key, optionally one of its values:
   * where the attribute inventory leads (FR-ATTR-09). Matched exactly; the
   * value is ignored without a key. */
  attributeKey: z.string().max(ATTRIBUTE_NAME_MAX_LENGTH).optional(),
  attributeValue: z.string().max(ATTRIBUTE_VALUE_MAX_LENGTH).optional(),
  /** The products one tier prices: where the tier list's count leads. */
  tierId: z.uuid().optional(),
  /** `no` shows the products the tier does not price: the gap a tier review
   * ends on. Ignored without `tierId`. */
  tierPriced: z.enum(['yes', 'no']).optional(),
  /** The products one document is shown on: where the document list's count
   * leads (FR-DOC-02). */
  documentId: z.uuid().optional(),
  /** What the product lacks (FR-ADM-20). Every entry must hold, and so must
   * `has` beside them: "featured, without a picture" is one question. */
  missing: listParam(z.enum(PRODUCT_GAP_FILTERS)),
  /** What the product carries beyond a name and a price; all must hold. */
  has: listParam(z.enum(PRODUCT_FEATURES)),
});
export type AdminProductListQuery = z.infer<typeof adminProductListQuerySchema>;

/** A missing row is a 404; everything else is a conflict. */
const productErrors = {
  'product-not-found': { status: 404 },
  'category-not-found': { status: 404 },
  'tier-not-found': { status: 404 },
  'paired-product-not-found': { status: 404 },
  'document-not-found': { status: 404 },
  'pairing-self': { status: 409 },
  'slug-taken': { status: 409 },
  'source-id-taken': { status: 409 },
  'slug-or-source-id-taken': { status: 409 },
  'product-has-no-price': { status: 409 },
  'product-published': { status: 409 },
  'product-deleted': { status: 409 },
  'product-not-deleted': { status: 409 },
  'product-ordered': { status: 409 },
} as const satisfies Record<ProductErrorCode, { status: number }>;

/** Saving a product can collide on either unique column, or name a gone tier,
 * a gone counterpart or a gone document. */
const productWriteErrors = {
  'catalog-externally-owned': ownershipErrors['catalog-externally-owned'],
  'category-not-found': productErrors['category-not-found'],
  'tier-not-found': productErrors['tier-not-found'],
  'paired-product-not-found': productErrors['paired-product-not-found'],
  'document-not-found': productErrors['document-not-found'],
  'pairing-self': productErrors['pairing-self'],
  'slug-taken': productErrors['slug-taken'],
  'source-id-taken': productErrors['source-id-taken'],
  'slug-or-source-id-taken': productErrors['slug-or-source-id-taken'],
} as const;

/** Every route here is admin-only. */
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
          pagination: paginationSchema,
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
    .errors({ 'product-not-found': productErrors['product-not-found'] })
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
      'product-not-found': productErrors['product-not-found'],
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
      // Refused while published: removal unpublishes first (FR-ADM-01). Open
      // while the catalog is externally owned: what is shown is the shop's.
      path: '/admin/catalog/products/{slug}',
      inputStructure: 'detailed',
      summary: 'Soft-delete a product (admin; reversible via restore)',
    })
    .errors({
      'product-not-found': productErrors['product-not-found'],
      'product-published': productErrors['product-published'],
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
      'product-not-found': productErrors['product-not-found'],
      'catalog-externally-owned': ownershipErrors['catalog-externally-owned'],
    })
    .input(z.object({ params: z.object({ slug: z.string() }) }))
    .output(adminProductSchema),

  /** What the product page falls back to when the public read finds nothing
   * (FR-ADM-06). */
  getProductPage: admin
    .route({
      method: 'GET',
      path: '/admin/catalog/products/{slug}/page',
      inputStructure: 'detailed',
      summary: 'Read any product as its page shows it, and why it is hidden',
    })
    .errors({ 'product-not-found': productErrors['product-not-found'] })
    .input(z.object({ params: z.object({ slug: z.string() }) }))
    .output(productPageSchema),

  /**
   * Removes a deleted product for good (FR-ADM-21), with its prices,
   * attributes, pairings and document links; the upload sweep takes its
   * pictures. Refused while the catalog is externally owned for one an admin
   * deleted: the source still sends it, and it would arrive again as new.
   */
  purgeProduct: admin
    .route({
      method: 'DELETE',
      path: '/admin/catalog/products/{slug}/permanent',
      inputStructure: 'detailed',
      summary: 'Delete a soft-deleted product permanently (admin)',
    })
    .errors({
      'product-not-found': productErrors['product-not-found'],
      'product-not-deleted': productErrors['product-not-deleted'],
      'product-ordered': productErrors['product-ordered'],
      'catalog-externally-owned': ownershipErrors['catalog-externally-owned'],
    })
    .input(z.object({ params: z.object({ slug: z.string() }) }))
    .output(productRefSchema),

  /**
   * Puts a product on the storefront or takes it off (FR-ADM-06). Publishing a
   * deleted one is refused, but the two stay independent in storage, so
   * restoring leaves publication as it was.
   */
  setProductPublished: admin
    .route({
      method: 'PATCH',
      path: '/admin/catalog/products/{slug}/published',
      inputStructure: 'detailed',
      summary: 'Publish or unpublish a product (admin)',
    })
    .errors({
      'product-not-found': productErrors['product-not-found'],
      'product-has-no-price': productErrors['product-has-no-price'],
      'product-deleted': productErrors['product-deleted'],
    })
    .input(
      z.object({
        params: z.object({ slug: z.string() }),
        body: z.object({ published: z.boolean() }).strict(),
      }),
    )
    .output(adminProductSchema),

  /**
   * The live products this one is the last counterpart on sale for, whose
   * pairing stops applying if it is unpublished (FR-SET-04). Asked by the
   * unpublish confirmation.
   */
  listStrandedPairings: admin
    .route({
      method: 'GET',
      path: '/admin/catalog/products/{slug}/stranded-pairings',
      inputStructure: 'detailed',
      summary:
        'List live products left with no counterpart if this one is unpublished (admin)',
    })
    .errors({ 'product-not-found': productErrors['product-not-found'] })
    .input(z.object({ params: z.object({ slug: z.string() }) }))
    .output(z.object({ items: z.array(productRefSchema) }).strict()),

  listHiddenProducts: admin
    .route({
      method: 'GET',
      // The edit-mode overlay under a category grid: the subtree's unpublished
      // products, unpaginated since the set is small. Deleted ones are out of
      // the catalog (FR-ADM-22).
      path: '/admin/catalog/categories/{slug}/hidden-products',
      inputStructure: 'detailed',
      summary:
        'List products in a category subtree that the storefront hides (admin)',
    })
    .errors({ 'category-not-found': productErrors['category-not-found'] })
    .input(z.object({ params: z.object({ slug: z.string() }) }))
    .output(z.object({ items: z.array(hiddenProductSchema) }).strict()),
};
