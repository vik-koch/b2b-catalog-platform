/**
 * The catalog import contract (FR-ADM-02, FR-ADM-07): the rows a run carries,
 * what it may write, and the diff it computes. Kept apart from the read
 * contract and the storage schema and held stable: a deployment's converter
 * absorbs a changing export. CSV and JSON are two encodings of the same rows.
 */
import * as z from 'zod';
import { CATALOG_SYNC_ALL_FIELDS, CATALOG_SYNC_FIELDS } from './catalog-sync';
import {
  SYNC_FAILURE_MESSAGE_MAX_LENGTH,
  SYNC_LABEL_MAX_LENGTH,
  SYNC_MAX_ROWS,
} from './sync';
import { syncRunSchema, syncSummarySchema } from './sync-run.contract';
import { priceMinorSchema } from '../catalog/catalog.contract';
import { taxRateSchema } from '../../lib/config/tax-config';
import { CATEGORY_NAME_MAX_LENGTH } from '../catalog/categories';
import {
  PRODUCT_NAME_MAX_LENGTH,
  SOURCE_ID_MAX_LENGTH,
} from '../catalog/products';
import { TIER_KEY_MAX_LENGTH } from '../catalog/tiers';

/** A tier key, or `DEFAULT_PRICE_LIST_ALIAS`. Not an enum: keys are each
 * deployment's own rows, so only the shape is checked here and the differ
 * checks that one exists. */
const catalogSyncPriceListKeySchema = z
  .string()
  .trim()
  .min(1)
  .max(TIER_KEY_MAX_LENGTH);
export type CatalogSyncPriceListKey = string;

/**
 * One product from the source, keyed by its `sourceId`. An absent field is
 * left untouched, never cleared, so a prices-only run is an ordinary run.
 * Prices are minor units: the API knows no currency, so the converter scales
 * them. A category comes as its leaf name and key, both or neither: the export
 * has no parent path, and an admin places a new category in the tree.
 */
export const catalogSyncRowSchema = z
  .object({
    sourceId: z.string().trim().min(1).max(SOURCE_ID_MAX_LENGTH),
    name: z.string().trim().min(1).max(PRODUCT_NAME_MAX_LENGTH).optional(),
    categorySourceId: z
      .string()
      .trim()
      .min(1)
      .max(SOURCE_ID_MAX_LENGTH)
      .optional(),
    categoryName: z
      .string()
      .trim()
      .min(1)
      .max(CATEGORY_NAME_MAX_LENGTH)
      .optional(),
    /** Only the lists present are written. A zero is a row error, not a
     * schema error: one bad line never fails a whole catalog. */
    prices: z
      .record(catalogSyncPriceListKeySchema, priceMinorSchema)
      .optional(),
    /** Pieces on hand (FR-STOCK-01). May be negative after a stocktake
     * correction, which reads as none in stock. */
    stockPieces: z.number().int().optional(),
    /** A percent (NFR-LEGAL-11); null is the deployment's default rate. */
    taxRate: taxRateSchema.nullable().optional(),
  })
  .strict()
  .refine(
    (row) =>
      (row.categorySourceId === undefined) === (row.categoryName === undefined),
    {
      message:
        'categorySourceId and categoryName must both be present or both absent',
      path: ['categoryName'],
    },
  );
export type CatalogSyncRow = z.infer<typeof catalogSyncRowSchema>;

/** The CSV headers: a required header row in any order. Prices are
 * `price:<key>`; a bare `price` means the default list. Any `price:` column
 * parses, and the differ decides whether it names a tier. */
export const CATALOG_SYNC_CSV_COLUMNS = {
  sourceId: 'sourceId',
  name: 'name',
  categorySourceId: 'categorySourceId',
  categoryName: 'categoryName',
  price: 'price',
  pricePrefix: 'price:',
  stock: 'stock',
  taxRate: 'taxRate',
} as const;

/** The canonical spelling of a price column. */
export function syncPriceColumn(key: CatalogSyncPriceListKey): string {
  return `${CATALOG_SYNC_CSV_COLUMNS.pricePrefix}${key}`;
}

/** The non-price fields; a run writes exactly the price lists its rows carry. */
export const catalogSyncFieldSchema = z.enum(CATALOG_SYNC_FIELDS);

/** What a run may do; nothing undeclared is written. Deleting requires the
 * claim that the file is the complete catalog. */
export const catalogSyncOptionsSchema = z
  .object({
    /** Non-price fields this run writes. Empty = prices only. */
    fields: z.array(catalogSyncFieldSchema).default(CATALOG_SYNC_ALL_FIELDS),
    /** Insert rows whose `sourceId` is unknown. */
    createMissing: z.boolean().default(true),
    /** Update rows whose `sourceId` is known. */
    updateExisting: z.boolean().default(true),
    /** A soft-deleted product reappearing in the file is restored. */
    restoreReturning: z.boolean().default(true),
    /** Created as roots for an admin to place. Off: an unknown category is a
     * row error. */
    createCategories: z.boolean().default(true),
    /** "This file is the complete catalog." Required to delete anything. */
    productSetAuthoritative: z.boolean().default(false),
    /** Soft-delete live products absent from the file. Never touches
     * categories, and never `manual:` products. */
    softDeleteMissingProducts: z.boolean().default(false),
  })
  .strict()
  .refine((o) => !o.softDeleteMissingProducts || o.productSetAuthoritative, {
    message:
      'softDeleteMissingProducts requires productSetAuthoritative: only a complete catalog export may delete',
    path: ['softDeleteMissingProducts'],
  });
export type CatalogSyncOptions = z.infer<typeof catalogSyncOptionsSchema>;

/** Prices are minor units, for the screen to format; the rest is text. */
const catalogSyncFieldChangeSchema = z
  .object({
    /** `name`, `category`, `stock`, `taxRate`, or `price:<listKey>`. */
    field: z.string(),
    from: z.union([z.string(), z.number(), z.null()]),
    to: z.union([z.string(), z.number(), z.null()]),
  })
  .strict();

const catalogSyncProductChangeSchema = z
  .object({
    kind: z.enum(['create', 'update', 'softDelete', 'restore']),
    sourceId: z.string(),
    /** The product's name after the run (or its current one, for a delete). */
    name: z.string(),
    /** Null for a product this run creates. */
    slug: z.string().nullable(),
    /** Empty for create, softDelete and restore. */
    changes: z.array(catalogSyncFieldChangeSchema),
  })
  .strict();
export type CatalogSyncProductChange = z.infer<
  typeof catalogSyncProductChangeSchema
>;

const catalogSyncCategoryChangeSchema = z
  .object({
    /** A sync never deletes a category. */
    kind: z.enum(['create', 'rename']),
    /** The name after the run. */
    name: z.string(),
    /** The name before the run; null for a category this run creates. */
    from: z.string().nullable(),
    /** How many of the file's rows land in it. */
    productCount: z.number().int().nonnegative(),
  })
  .strict();

/** Reported only: removing it is an admin's act (FR-ADM-01). */
const catalogSyncEmptiedCategorySchema = z
  .object({ slug: z.string(), name: z.string() })
  .strict();

/** Why a row was skipped; `params` quote the file back in the sentence. */
const CATALOG_SYNC_ROW_ERROR_CODES = [
  'missing-source-id',
  /** The same sourceId twice in one file. */
  'duplicate-source-id',
  /** `{category}`: one half of the category pair without the other. */
  'category-id-without-name',
  'category-name-without-id',
  /** `{price}` and `{column}` */
  'price-not-an-integer',
  /** `{column}` */
  'price-is-zero',
  /** `{stock}` */
  'stock-not-an-integer',
  /** `{taxRate}`: not a percent from 0 to 100 with two decimals at most. */
  'tax-rate-invalid',
  /** `{key}` and `{known}` */
  'unknown-price-list',
  /** `{key}`, `{first}` and `{second}`: one category under two names. */
  'category-name-conflict',
  /** `{name}` and `{key}`, on a run that does not create categories. */
  'unknown-category',
  'cannot-create-product',
] as const;

/** A skipped row; the rest of the run still applies. */
export const catalogSyncRowErrorSchema = z
  .object({
    /** 1-based line number in the uploaded file (header excluded). */
    row: z.number().int().positive(),
    sourceId: z.string().nullable(),
    code: z.enum(CATALOG_SYNC_ROW_ERROR_CODES),
    /** Substituted into the deployment's wording; absent where none is needed. */
    params: z.record(z.string(), z.string()).optional(),
  })
  .strict();
export type CatalogSyncRowError = z.infer<typeof catalogSyncRowErrorSchema>;

export const catalogSyncPlanSchema = z
  .object({
    summary: syncSummarySchema,
    products: z.array(catalogSyncProductChangeSchema),
    categories: z.array(catalogSyncCategoryChangeSchema),
    emptiedCategories: z.array(catalogSyncEmptiedCategorySchema),
    /** `manual:` products the delete sweep kept. */
    keptManual: z.array(
      z.object({ sourceId: z.string(), name: z.string() }).strict(),
    ),
    rowErrors: z.array(catalogSyncRowErrorSchema),
    /** True when any list above was capped at SYNC_PREVIEW_MAX_ITEMS. */
    truncated: z.boolean(),
  })
  .strict();
export type CatalogSyncPlan = z.infer<typeof catalogSyncPlanSchema>;

/** A headless run (FR-ADM-07): an upload's rows and intent, as JSON. */
export const catalogSyncSubmissionSchema = z
  .object({
    rows: z.array(catalogSyncRowSchema).max(SYNC_MAX_ROWS),
    /** Absent means the defaults, as for an upload. */
    options: catalogSyncOptionsSchema.optional(),
    /** The run's name in the log, where an upload has a filename. */
    label: z.string().trim().min(1).max(SYNC_LABEL_MAX_LENGTH).optional(),
    /** Stage even if the policy would apply it: the client cannot vouch for
     * what it parsed. */
    requestReview: z.boolean().default(false),
    /** The caller's note for a person, shown beside the run. It decides
     * nothing: only `requestReview` holds a run back. */
    notice: z
      .string()
      .trim()
      .min(1)
      .max(SYNC_FAILURE_MESSAGE_MAX_LENGTH)
      .optional(),
  })
  .strict();
export type CatalogSyncSubmission = z.infer<typeof catalogSyncSubmissionSchema>;

/** `run.status` says whether it applied or waits for a person, and
 * `run.stagedReason` why. */
export const catalogSyncSubmitResponseSchema = z
  .object({ run: syncRunSchema, plan: catalogSyncPlanSchema })
  .strict();
export type CatalogSyncSubmitResponse = z.infer<
  typeof catalogSyncSubmitResponseSchema
>;

/** An upload's preview: one engine, so one shape. */
export type CatalogSyncPreviewResponse = CatalogSyncSubmitResponse;
