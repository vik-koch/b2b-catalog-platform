import { oc } from '@orpc/contract';
import * as z from 'zod';
import {
  CATEGORY_NAME_MAX_LENGTH,
  PRODUCT_ATTRIBUTE_KEY_MAX_LENGTH,
  PRODUCT_ATTRIBUTE_VALUE_MAX_LENGTH,
  PRODUCT_ATTRIBUTES_MAX,
  PRODUCT_DESCRIPTION_MAX_LENGTH,
  PRODUCT_IMAGES_MAX,
  PRODUCT_LINE_NOTE_PROMPT_MAX_LENGTH,
  PRODUCT_NAME_MAX_LENGTH,
  PRODUCT_PAIRINGS_MAX,
  PRODUCT_TIER_PRICES_MAX,
  SOURCE_ID_MAX_LENGTH,
} from './catalog-constants';
import { commonAuthErrors } from './api-error';
import {
  availabilitySchema,
  catalogImageSchema,
  priceMinorSchema,
  productAttributeSchema,
  productListItemSchema,
} from './catalog.contract';
import { SEARCH_QUERY_MAX_LENGTH } from './catalog-constants';
import { basisDividesQuantities, minimumFitsPacks } from './product-units';
import {
  ATTRIBUTE_NAME_MAX_LENGTH,
  ATTRIBUTE_VALUE_MAX_LENGTH,
} from './attribute-value';
import { PRODUCT_AVAILABILITIES } from './product-availability';
import { slugSchema } from './slug';

/**
 * One tier's price for this product (FR-AUTH-05). Tiers are addressed by id
 * here rather than by their sync key: the editor already has the tier list in
 * hand, and an id survives a key being renamed mid-edit.
 *
 * The base price is **not** in this list — it is the product's own
 * `priceMinor`. A tier absent from the list has no override and falls back to
 * it, which is how a tier carries only its exceptions.
 */
export const productTierPriceSchema = z
  .object({
    tierId: z.uuid(),
    priceMinor: priceMinorSchema,
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
  key: z.string().trim().max(PRODUCT_ATTRIBUTE_KEY_MAX_LENGTH),
  value: z.string().trim().max(PRODUCT_ATTRIBUTE_VALUE_MAX_LENGTH),
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
    priceMinor: priceMinorSchema,
    /** The single owning category (FR-CAT-05); picked from the admin tree. */
    categoryId: z.uuid(),
    /** Sanitized server-side before storage, same discipline as page bodies.
     * May be empty. The editor is limited to PRODUCT_RICH_TEXT_TAGS. */
    descriptionHtml: z.string().max(PRODUCT_DESCRIPTION_MAX_LENGTH).default(''),
    attributes: z
      .array(attributeInputSchema)
      .max(PRODUCT_ATTRIBUTES_MAX)
      .default([]),
    /** Ordered gallery; array order is display order. Each is a stored
     * `{ full, thumb }` media pair (ADR 0021/0022). */
    images: z.array(catalogImageSchema).max(PRODUCT_IMAGES_MAX).default([]),
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
    /** How many pieces `priceMinor` covers. Staff-only; never served publicly. */
    priceBasisPieces: z.number().int().positive().default(1),
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
  // What keeps totals exact: every purchasable quantity must be a whole number
  // of basis units. Checked here as well as in the database so the editor gets a
  // 400 naming the field rather than a constraint violation.
  .refine((input) => basisDividesQuantities(input, input.priceBasisPieces), {
    message:
      'The price basis must divide the minimum quantity, the pack size and the quantity step',
    path: ['priceBasisPieces'],
  })
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
    priceMinor: priceMinorSchema,
    categoryId: z.uuid(),
    sourceId: z.string(),
    descriptionHtml: z.string(),
    attributes: z.array(productAttributeSchema),
    images: z.array(catalogImageSchema),
    /** Only the tiers that override the base price; never the base itself. */
    tierPrices: z.array(productTierPriceSchema),
    priceBasisPieces: z.number().int().positive(),
    piecesPerPack: z.number().int().positive().nullable(),
    packsPerBox: z.number().int().positive().nullable(),
    minPieceQty: z.number().int().positive(),
    boxVolume: z.string().nullable(),
    boxWeight: z.string().nullable(),
    boxCount: z.number().int().positive(),
    lineNoteEnabled: z.boolean(),
    lineNotePrompt: z.string().nullable(),
    /** Staff-facing, and the reason the editor can be trusted to read back what
     * it wrote: the state below is recomputed from these in the same save. */
    stockPieces: z.number().int().nullable(),
    lowStockThresholdPieces: z.number().int().positive().nullable(),
    /** Read-only — derived from the two above and the packaging, never sent. */
    availability: availabilitySchema,
    /** The counterparts, named — a save sends `pairedSlugs` back (FR-SET-01). */
    pairings: z.array(pairedProductSchema),
    /** ISO 8601, or null when live. Drives the greyed-out admin styling. */
    deletedAt: z.iso.datetime().nullable(),
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
    priceMinor: priceMinorSchema,
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
    deletedAt: z.iso.datetime().nullable(),
    /** Null while the product is not on the storefront (FR-ADM-06). */
    publishedAt: z.iso.datetime().nullable(),
    updatedAt: z.iso.datetime(),
  })
  .strict();
export type AdminProductListItem = z.infer<typeof adminProductListItemSchema>;

/**
 * A product the storefront is not showing, and why — the edit-mode overlay under
 * a category grid. The public tile shape plus its reasons, which are not
 * exclusive: a product can be both unpublished and deleted.
 */
export const hiddenProductSchema = productListItemSchema.extend({
  deleted: z.boolean(),
  unpublished: z.boolean(),
});
export type HiddenProduct = z.infer<typeof hiddenProductSchema>;

/**
 * Which publication states the grid shows (FR-ADM-05). `all` is the default —
 * the admin sees the whole catalog, soft-deleted rows included and greyed out —
 * with the rest as narrowing filters rather than the storefront's implicit
 * "live only". `live` means on the storefront: published and not deleted.
 * `unpublished` is the review queue a sync fills (FR-ADM-06).
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
  'relevance',
  'name',
  'name_desc',
  'price',
  'price_desc',
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
  categoryId: z.uuid().optional(),
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
});
export type AdminProductListQuery = z.infer<typeof adminProductListQuerySchema>;

/**
 * A category as the management screen sees it: the structural fields plus the
 * presentation overlay, and the two counts the delete guard needs — a category
 * with products or children cannot be removed (FK is `restrict`).
 * Returned as a flat list; the client shapes the tree (same as the read side).
 */
export const adminCategorySchema = z
  .object({
    id: z.uuid(),
    slug: z.string(),
    name: z.string(),
    parentId: z.uuid().nullable(),
    sortOrder: z.number().int(),
    image: catalogImageSchema.nullable(),
    sourceId: z.string(),
    description: z.string().nullable(),
    /** Optional nickname for contexts where the parent is visible; see the
     * public contract's `shortNameSchema`. */
    shortName: z.string().nullable(),
    productCount: z.number().int().nonnegative(),
    childCount: z.number().int().nonnegative(),
  })
  .strict();
export type AdminCategory = z.infer<typeof adminCategorySchema>;

/** What create/update accept for a category. `slug` follows the same
 * optional-override rule as products (omit to derive/keep). `sourceId` is
 * server-owned. Reorder/reparent within the tree goes through `reorder`, but a
 * single move may also set `parentId` here. */
export const categoryInputSchema = z
  .object({
    name: z.string().trim().min(1).max(CATEGORY_NAME_MAX_LENGTH),
    /** Optional nickname, admin-owned overlay. Empty means "no nickname" and is
     * normalized to null, so the fallback to `name` has one representation. */
    shortName: z
      .string()
      .trim()
      .max(CATEGORY_NAME_MAX_LENGTH)
      .nullable()
      .default(null)
      .transform((value) => value || null),
    /** Optional slug override; see the product schema doc. */
    slug: slugSchema.optional(),
    parentId: z.uuid().nullable().default(null),
    image: catalogImageSchema.nullable().default(null),
    /** Private sync key. Admin-settable to pre-assign a legacy key for future
     * file reconciliation; omit to let the server generate `manual:<uuid>`. */
    sourceId: z.string().trim().min(1).max(SOURCE_ID_MAX_LENGTH).optional(),
    description: z
      .string()
      .max(PRODUCT_DESCRIPTION_MAX_LENGTH)
      .nullable()
      .default(null),
  })
  .strict();
export type CategoryInput = z.infer<typeof categoryInputSchema>;

/**
 * One node's new place after a drag-drop rearrange. The client posts the whole
 * set it changed (or all of them — it is idempotent): each row's `parentId` and
 * `sortOrder` are set as given, in a single transaction, so the tree can never
 * be left half-reordered.
 */
export const categoryOrderEntrySchema = z
  .object({
    id: z.uuid(),
    parentId: z.uuid().nullable(),
    sortOrder: z.number().int().nonnegative(),
  })
  .strict();
export type CategoryOrderEntry = z.infer<typeof categoryOrderEntrySchema>;

export const reorderCategoriesSchema = z
  .object({ order: z.array(categoryOrderEntrySchema) })
  .strict();
export type ReorderCategoriesRequest = z.infer<typeof reorderCategoriesSchema>;

/**
 * Why a catalog write was refused. The slug and source-id conflicts are the
 * ones an editor acts on directly — the field it names is on screen — and the
 * category guards are what the delete dialog explains before offering a
 * reassign target.
 */
export const CATALOG_ERROR_CODES = [
  'product-not-found',
  'category-not-found',
  /** The category a delete would move products into is gone. */
  'reassign-target-not-found',
  'category-has-subcategories',
  'category-has-products',
  'category-reassign-to-self',
  /** A reparent (single or in a reorder) that would make a category its own ancestor. */
  'category-cycle',
  'slug-taken',
  'source-id-taken',
  /** A tier price naming a price list that no longer exists. */
  'tier-not-found',
  /** A pairing naming a product that no longer exists. */
  'paired-product-not-found',
  /** A product paired with itself, which is not a pairing. */
  'pairing-self',
  /**
   * A unique violation that got past the pre-checks — two admins saving the
   * same slug at once. Which of the two columns collided is not worth a round
   * trip to find out, so it is one code.
   */
  'slug-or-source-id-taken',
] as const;
export type CatalogErrorCode = (typeof CATALOG_ERROR_CODES)[number];

/**
 * The status each refusal travels with. A missing row is a 404; everything
 * else is a conflict — the row is there, and what was asked of it is what
 * cannot be done.
 */
const e = {
  'product-not-found': { status: 404 },
  'category-not-found': { status: 404 },
  'reassign-target-not-found': { status: 404 },
  'tier-not-found': { status: 404 },
  'paired-product-not-found': { status: 404 },
  'pairing-self': { status: 409 },
  'category-has-subcategories': { status: 409 },
  'category-has-products': { status: 409 },
  'category-reassign-to-self': { status: 409 },
  'category-cycle': { status: 409 },
  'slug-taken': { status: 409 },
  'source-id-taken': { status: 409 },
  'slug-or-source-id-taken': { status: 409 },
} as const satisfies Record<CatalogErrorCode, { status: number }>;

/** Saving a product can collide on either unique column, or name a gone tier
 * or a gone counterpart. */
const productWriteErrors = {
  'category-not-found': e['category-not-found'],
  'tier-not-found': e['tier-not-found'],
  'paired-product-not-found': e['paired-product-not-found'],
  'pairing-self': e['pairing-self'],
  'slug-taken': e['slug-taken'],
  'source-id-taken': e['source-id-taken'],
  'slug-or-source-id-taken': e['slug-or-source-id-taken'],
} as const;

/**
 * Every admin catalog route can be rejected by the auth guards; declared once
 * here rather than on each route.
 */
const admin = oc.errors(commonAuthErrors);

export const adminCatalogContract = {
  // --- Products -----------------------------------------------------------
  listProducts: admin
    .route({
      method: 'GET',
      path: '/admin/catalog/products',
      inputStructure: 'detailed',
      summary: 'List products for the admin grid (includes soft-deleted)',
    })
    .input(z.object({ query: adminProductListQuerySchema }))
    .output(
      z
        .object({
          items: z.array(adminProductListItemSchema),
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
    .errors({ 'product-not-found': e['product-not-found'] })
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
      'product-not-found': e['product-not-found'],
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
      // No body; soft delete only (sets deletedAt).
      path: '/admin/catalog/products/{slug}',
      inputStructure: 'detailed',
      summary: 'Soft-delete a product (admin; reversible via restore)',
    })
    .errors({ 'product-not-found': e['product-not-found'] })
    .input(z.object({ params: z.object({ slug: z.string() }) }))
    .output(adminProductSchema),

  restoreProduct: admin
    .route({
      method: 'POST',
      path: '/admin/catalog/products/{slug}/restore',
      inputStructure: 'detailed',
      summary: 'Restore a soft-deleted product (admin)',
    })
    .errors({ 'product-not-found': e['product-not-found'] })
    .input(z.object({ params: z.object({ slug: z.string() }) }))
    .output(adminProductSchema),

  /**
   * Put a product on the storefront, or take it off (FR-ADM-06).
   *
   * The body names the state rather than the action, because this is one
   * reversible switch rather than a pair — and unlike restore, it says
   * nothing about whether the product is deleted: the two are independent,
   * so restoring an unpublished product leaves it unpublished.
   */
  setProductPublished: admin
    .route({
      method: 'PATCH',
      path: '/admin/catalog/products/{slug}/published',
      inputStructure: 'detailed',
      summary: 'Publish or unpublish a product (admin)',
    })
    .errors({ 'product-not-found': e['product-not-found'] })
    .input(
      z.object({
        params: z.object({ slug: z.string() }),
        body: z.object({ published: z.boolean() }).strict(),
      }),
    )
    .output(adminProductSchema),

  listHiddenProducts: admin
    .route({
      method: 'GET',
      // Powers the storefront edit-mode overlay under a category grid: what is
      // in this subtree but not on the storefront — soft-deleted, unpublished,
      // or both (Pattern A, same aggregation as the public grid). Without it an
      // admin browsing a category sees a catalogue that looks complete and is
      // not. Unpaginated: a category's hidden set is small. Fetched only when
      // edit mode is on, so the public read path stays untouched.
      path: '/admin/catalog/categories/{slug}/hidden-products',
      inputStructure: 'detailed',
      summary:
        'List products in a category subtree that the storefront hides (admin)',
    })
    .errors({ 'category-not-found': e['category-not-found'] })
    .input(z.object({ params: z.object({ slug: z.string() }) }))
    .output(z.object({ items: z.array(hiddenProductSchema) }).strict()),

  // --- Categories ---------------------------------------------------------
  listCategories: admin
    .route({
      method: 'GET',
      path: '/admin/catalog/categories',
      summary: 'List all categories with counts (admin management view)',
    })
    .output(z.object({ categories: z.array(adminCategorySchema) }).strict()),

  createCategory: admin
    .route({
      method: 'POST',
      path: '/admin/catalog/categories',
      successStatus: 201,
      inputStructure: 'detailed',
      summary: 'Create a category (admin; slug/sourceId generated)',
    })
    .errors({ 'category-not-found': e['category-not-found'] })
    .input(z.object({ body: categoryInputSchema }))
    .output(adminCategorySchema),

  updateCategory: admin
    .route({
      method: 'PUT',
      path: '/admin/catalog/categories/{id}',
      inputStructure: 'detailed',
      summary: 'Update a category name/overlay (admin)',
    })
    .errors({
      'category-not-found': e['category-not-found'],
      'category-cycle': e['category-cycle'],
    })
    .input(
      z.object({
        params: z.object({ id: z.uuid() }),
        body: categoryInputSchema,
      }),
    )
    .output(adminCategorySchema),

  deleteCategory: admin
    .route({
      method: 'DELETE',
      path: '/admin/catalog/categories/{id}',
      inputStructure: 'detailed',
      summary:
        'Delete a category (admin; optionally reassign its products first)',
    })
    .errors({
      // Category (or the reassign target) not found.
      'category-not-found': e['category-not-found'],
      'reassign-target-not-found': e['reassign-target-not-found'],
      // Blocked: has subcategories, or has products and no `reassignTo`.
      'category-has-subcategories': e['category-has-subcategories'],
      'category-has-products': e['category-has-products'],
      'category-reassign-to-self': e['category-reassign-to-self'],
    })
    .input(
      z.object({
        params: z.object({ id: z.uuid() }),
        // `reassignTo` moves every product (including soft-deleted ones — the
        // FK is `restrict` and blocks on those too) to another category first,
        // so a populated category can be deleted without orphaning its
        // products. Omit it to keep the strict guard (409 if the category has
        // any products). Subcategories always block regardless — the admin
        // resolves the subtree first; reassignment never merges child
        // categories.
        query: z.object({ reassignTo: z.uuid().optional() }),
      }),
    )
    .output(z.object({ message: z.string() })),

  reorderCategories: admin
    .route({
      method: 'PATCH',
      // No clash with `/admin/catalog/categories/{id}`: nothing else answers
      // PATCH here.
      path: '/admin/catalog/categories/order',
      inputStructure: 'detailed',
      summary: 'Reparent/reorder categories in one transaction (admin)',
    })
    .errors({
      'category-not-found': e['category-not-found'],
      'category-cycle': e['category-cycle'],
    })
    .input(z.object({ body: reorderCategoriesSchema }))
    .output(z.object({ categories: z.array(adminCategorySchema) }).strict()),
};
