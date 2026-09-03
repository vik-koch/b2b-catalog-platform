import { oc } from '@orpc/contract';
import * as z from 'zod';
import { SYNC_ALL_FIELDS, SYNC_FIELDS } from './sync-constants';
import { commonAuthErrors } from './api-error';
import { priceMinorSchema } from './catalog.contract';
import {
  CATEGORY_NAME_MAX_LENGTH,
  PRODUCT_NAME_MAX_LENGTH,
  SOURCE_ID_MAX_LENGTH,
} from './catalog-constants';
import { TIER_KEY_MAX_LENGTH } from './tier-constants';

/**
 * The bulk catalog sync.
 *
 * This file is the *import contract*: the row shape a run consumes and the
 * per-run intent that decides what a run may write. It is deliberately
 * independent of both the public read contract and the storage schema,
 * and it is the one shape promised to stay stable — a client-specific converter
 * turns the raw export into it, so a changing export costs an adapter,
 * never a contract change.
 *
 * CSV and JSON are two *encodings* of the same rows; both decode into
 * `SyncRow[]` and run through the same validator, differ and applier.
 */

// --- The row -------------------------------------------------------------

/**
 * A price-list key: `default` for the base list, otherwise a
 * `customer_tiers.key`.
 *
 * Deliberately **not** an enum. Tier keys are a deployment's own commercial
 * vocabulary, so listing them here would put client business terms in the
 * public repo and make "the client added a price list" a code change and a
 * release. This validates only the *shape* a key can have; whether it names
 * something is settled against the database by the sync validator, exactly as
 * `categorySourceId` is. That is what lets this contract stay stable for good,
 * which is what 0026 promised.
 */
export const syncPriceListKeySchema = z
  .string()
  .trim()
  .min(1)
  .max(TIER_KEY_MAX_LENGTH);
export type SyncPriceListKey = string;

/**
 * One product from the source, keyed by the private `sourceId` (ADR 0022).
 * Every other field is optional: a run carrying only prices is a first-class
 * run, not a special case. Absent is *not* empty — an absent field is left
 * untouched, never cleared.
 *
 * Prices are integer **minor units** (matching the read contract and storage):
 * the API is deliberately currency-agnostic — it knows no locale, no ISO code
 * and no minor-unit exponent — so major→minor conversion belongs to the
 * converter, which does know the deployment's currency.
 *
 * A category is identified by its own private `categorySourceId`; the export
 * carries no parent path, so `categoryName` is the *leaf* name and the parent
 * is assigned by hand in the admin UI. The two travel together — an id without
 * a name cannot create the category, and a name without an id cannot say which
 * category it renames — so a row carries both or neither.
 */
export const syncRowSchema = z
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
    /**
     * Per price list, in minor units. Only the keys present are written: a
     * file that carries `price:wholesale` and nothing else leaves the base
     * price and every other list untouched.
     */
    prices: z.record(syncPriceListKeySchema, priceMinorSchema).optional(),
    /**
     * Pieces on hand (FR-STOCK-01). Not bounded below — a stocktake correction
     * may leave a figure negative, and the state reads that as none in stock.
     * Absent is untouched, as everywhere else here: a run cannot stop tracking
     * a product's stock by leaving the cell empty, only by an admin clearing
     * the field.
     */
    stockPieces: z.number().int().optional(),
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
export type SyncRow = z.infer<typeof syncRowSchema>;

// --- CSV encoding --------------------------------------------------------

/**
 * CSV column headers, so the parser, the converter and the admin help text
 * agree on one spelling. The header row is required and order-independent;
 * price columns are `price:<listKey>`, with a bare `price` accepted as an alias
 * for `price:default` so a single-price export stays readable in a spreadsheet.
 * Which list keys exist is a per-deployment question, so the parser accepts any
 * `price:` column and the validator decides whether it names a tier.
 */
export const SYNC_CSV_COLUMNS = {
  sourceId: 'sourceId',
  name: 'name',
  categorySourceId: 'categorySourceId',
  categoryName: 'categoryName',
  price: 'price',
  pricePrefix: 'price:',
  stock: 'stock',
} as const;

/** `price:default` etc. — the canonical spelling of a price column. */
export function syncPriceColumn(key: SyncPriceListKey): string {
  return `${SYNC_CSV_COLUMNS.pricePrefix}${key}`;
}

// --- Per-run intent ------------------------------------------------------

/**
 * Non-price fields a run may write. Prices are self-describing (a run writes
 * exactly the price-list keys its rows carry), so they are not listed here.
 */
export const syncFieldSchema = z.enum(SYNC_FIELDS);
export type SyncField = z.infer<typeof syncFieldSchema>;

/**
 * What a run is allowed to do. Anything not declared here is not written, so a
 * price-only run can never clobber an admin's rename.
 *
 * The one dangerous option is gated: `softDeleteMissingProducts` requires
 * `productSetAuthoritative` — an explicit claim that the file is the *complete*
 * catalog. Authority over the product set, not the size of the field set, is
 * the precondition deletion actually needs.
 */
export const syncOptionsSchema = z
  .object({
    /** Non-price fields this run writes. Empty = prices only. */
    fields: z.array(syncFieldSchema).default(SYNC_ALL_FIELDS),
    /** Insert rows whose `sourceId` is unknown. */
    createMissing: z.boolean().default(true),
    /** Update rows whose `sourceId` is known. */
    updateExisting: z.boolean().default(true),
    /** A soft-deleted product reappearing in the file is restored. */
    restoreReturning: z.boolean().default(true),
    /**
     * Create categories the file names but the catalog does not have. They are
     * created **unparented** (as roots) for an admin to place in the tree — the
     * export carries no hierarchy. Off means an unknown category is a row error.
     */
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
export type SyncOptions = z.infer<typeof syncOptionsSchema>;

// --- The diff ------------------------------------------------------------

/** One field's before → after. Prices arrive as minor-unit numbers so the UI
 * can format them with the deployment's currency; everything else is text. */
export const syncFieldChangeSchema = z
  .object({
    /** `name`, `category`, or `price:<listKey>`. */
    field: z.string(),
    from: z.union([z.string(), z.number(), z.null()]),
    to: z.union([z.string(), z.number(), z.null()]),
  })
  .strict();
export type SyncFieldChange = z.infer<typeof syncFieldChangeSchema>;

export const syncProductChangeSchema = z
  .object({
    kind: z.enum(['create', 'update', 'softDelete', 'restore']),
    sourceId: z.string(),
    /** The product's name after the run (or its current one, for a delete). */
    name: z.string(),
    /** Null for a product this run creates — it has no URL yet. */
    slug: z.string().nullable(),
    /** Empty for create/softDelete/restore, which are self-describing. */
    changes: z.array(syncFieldChangeSchema),
  })
  .strict();
export type SyncProductChange = z.infer<typeof syncProductChangeSchema>;

export const syncCategoryChangeSchema = z
  .object({
    /** `create` or `rename` — a sync never deletes a category. Renaming is
     * safe because identity is the `categorySourceId`, not the name. */
    kind: z.enum(['create', 'rename']),
    /** The name after the run. */
    name: z.string(),
    /** The name before the run; null for a category this run creates. */
    from: z.string().nullable(),
    /** How many of the file's rows land in it. */
    productCount: z.number().int().nonnegative(),
  })
  .strict();
export type SyncCategoryChange = z.infer<typeof syncCategoryChangeSchema>;

/** A category left with no live products by this run. Reported only — removal
 * is a deliberate admin action (FR-ADM-01), never a sync's. */
export const syncEmptiedCategorySchema = z
  .object({ slug: z.string(), name: z.string() })
  .strict();

/**
 * Why one row was skipped. Same discipline as every other refusal: a code the
 * screen switches on, with `params` naming the things in the admin's own file
 * that the sentence has to quote back at them.
 */
export const SYNC_ROW_ERROR_CODES = [
  'missing-source-id',
  /** The same sourceId twice in one file. */
  'duplicate-source-id',
  /** `{category}` — one half of the category pair without the other. */
  'category-id-without-name',
  'category-name-without-id',
  /** `{price}` and `{column}` */
  'price-not-an-integer',
  /** `{stock}` — a stock cell that is not a whole number. */
  'stock-not-an-integer',
  /** `{key}` and `{known}` */
  'unknown-price-list',
  /** `{key}`, `{first}` and `{second}` — the file names one category twice. */
  'category-name-conflict',
  /** `{name}` and `{key}` — and the run does not create categories. */
  'unknown-category',
  'cannot-create-product',
] as const;
export type SyncRowErrorCode = (typeof SYNC_ROW_ERROR_CODES)[number];

/** A row that could not be applied. The run still previews and commits; these
 * rows are skipped, so one bad line never fails a whole catalog. */
export const syncRowErrorSchema = z
  .object({
    /** 1-based line number in the uploaded file (header excluded). */
    row: z.number().int().positive(),
    sourceId: z.string().nullable(),
    code: z.enum(SYNC_ROW_ERROR_CODES),
    /** Substituted into the deployment's wording; absent where none is needed. */
    params: z.record(z.string(), z.string()).optional(),
  })
  .strict();
export type SyncRowError = z.infer<typeof syncRowErrorSchema>;

export const syncSummarySchema = z
  .object({
    rows: z.number().int().nonnegative(),
    create: z.number().int().nonnegative(),
    update: z.number().int().nonnegative(),
    softDelete: z.number().int().nonnegative(),
    restore: z.number().int().nonnegative(),
    unchanged: z.number().int().nonnegative(),
    categoriesCreated: z.number().int().nonnegative(),
    /** Defaulted, so summaries stored before renaming existed still parse. */
    categoriesRenamed: z.number().int().nonnegative().default(0),
    /** Live products absent from the file but kept because they are `manual:`. */
    keptManual: z.number().int().nonnegative(),
    errors: z.number().int().nonnegative(),
  })
  .strict();
export type SyncSummary = z.infer<typeof syncSummarySchema>;

export const syncPlanSchema = z
  .object({
    summary: syncSummarySchema,
    products: z.array(syncProductChangeSchema),
    categories: z.array(syncCategoryChangeSchema),
    emptiedCategories: z.array(syncEmptiedCategorySchema),
    /** Kept `manual:` products, for an informed exclusion rather than a silent one. */
    keptManual: z.array(
      z.object({ sourceId: z.string(), name: z.string() }).strict(),
    ),
    rowErrors: z.array(syncRowErrorSchema),
    /** True when any list above was capped at SYNC_PREVIEW_MAX_ITEMS. */
    truncated: z.boolean(),
  })
  .strict();
export type SyncPlan = z.infer<typeof syncPlanSchema>;

// --- Runs ----------------------------------------------------------------

export const syncRunStatusSchema = z.enum(['previewed', 'applied', 'failed']);
export type SyncRunStatus = z.infer<typeof syncRunStatusSchema>;

/** How the run entered the system. `api` is the headless path (not built yet —
 * it needs a non-cookie credential; deferred with its own ADR). */
export const syncRunSourceSchema = z.enum(['upload', 'api']);

export const syncRunSchema = z
  .object({
    id: z.uuid(),
    status: syncRunStatusSchema,
    source: syncRunSourceSchema,
    filename: z.string().nullable(),
    startedAt: z.iso.datetime(),
    finishedAt: z.iso.datetime().nullable(),
    /** Who ran it; null if that account has since been deleted. */
    actorEmail: z.string().nullable(),
    options: syncOptionsSchema,
    summary: syncSummarySchema,
    error: z.string().nullable(),
  })
  .strict();
export type SyncRun = z.infer<typeof syncRunSchema>;

/**
 * Why a whole file was refused before any row was read. The upload is
 * multipart, so it is not part of the router below — but its refusal shape is
 * the same as every other one here, and the browser needs it typed.
 *
 * These are the one place a code is not the whole story: what an admin needs
 * to see is *which* column is duplicated in the file on their screen. So the
 * body carries `params` for the deployment's own sentence to substitute, and
 * the values are the admin's own data (their column names, their row count) —
 * never wording of ours.
 */
export const SYNC_FORMAT_CODES = [
  'no-file',
  'file-too-large',
  'file-empty',
  'no-header-row',
  /** A quote is opened and never closed, so the parser cannot tell where a
   * field ends. `{row}` — the line the parser gave up on. */
  'malformed-quotes',
  /** `{column}` */
  'duplicate-column',
  /** `{columns}` and `{expected}` */
  'unknown-columns',
  /** `{column}` */
  'missing-required-column',
  /** `{rows}` and `{limit}` */
  'too-many-rows',
  /** The options field the upload form sends alongside; a client bug. */
  'options-invalid',
] as const;
export type SyncFormatCode = (typeof SYNC_FORMAT_CODES)[number];

/**
 * A refused upload, as it arrives.
 *
 * The upload is multipart and so not a contract route, but its refusals travel
 * in the same envelope as every other one — code at the top, anything the
 * wording needs under `data`. Read here and flattened, so the screen keeps
 * working with a plain `{ code, message, params }`.
 *
 * Not strict: the envelope carries `defined` and `status` as well, and neither
 * is this schema's business.
 */
export const syncFormatErrorSchema = z
  .object({
    code: z.enum(SYNC_FORMAT_CODES),
    message: z.string(),
    data: z
      .object({
        /** Substituted into the deployment's wording; absent where none is
         * needed. */
        params: z.record(z.string(), z.string()).optional(),
      })
      .optional(),
  })
  .transform(({ code, message, data }) => ({
    code,
    message,
    params: data?.params,
  }));
export type SyncFormatErrorBody = z.infer<typeof syncFormatErrorSchema>;

/** What a preview returns: the staged run plus the plan it computed. */
export const syncPreviewResponseSchema = z
  .object({ run: syncRunSchema, plan: syncPlanSchema })
  .strict();
export type SyncPreviewResponse = z.infer<typeof syncPreviewResponseSchema>;

/** What a commit returns: the finished run plus what was *actually* applied,
 * which may differ from the preview if the catalog moved in between. */
export const syncCommitResponseSchema = z
  .object({ run: syncRunSchema, applied: syncSummarySchema })
  .strict();
export type SyncCommitResponse = z.infer<typeof syncCommitResponseSchema>;

/**
 * Why a previewed run could not be applied. `run-already-applied` and
 * `run-failed` are separate codes rather than one carrying the status, because
 * they are separate sentences: one says the work is already done, the other
 * that it went wrong and the file has to go up again.
 */
export const SYNC_COMMIT_CODES = [
  'run-not-found',
  'run-already-applied',
  'run-failed',
  /** Staged rows pruned; the diff cannot be recomputed, so re-upload. */
  'run-rows-pruned',
] as const;
export type SyncCommitCode = (typeof SYNC_COMMIT_CODES)[number];

/** A run nobody staged is a 404; one that cannot be applied is a conflict. */
const commitErrors = {
  'run-not-found': { status: 404 },
  'run-already-applied': { status: 409 },
  'run-failed': { status: 409 },
  'run-rows-pruned': { status: 409 },
} as const satisfies Record<SyncCommitCode, { status: number }>;

/**
 * The JSON half of the sync surface. The preview *upload* is not here: it is
 * multipart/form-data, which the JSON-oriented contracts do not model, so it
 * lives on a plain Nest handler that returns `SyncPreviewResponse` (the same
 * split the media upload uses).
 */
/** Every sync route is admin-only. */
const admin = oc.errors(commonAuthErrors);

export const syncContract = {
  commitRun: admin
    .route({
      method: 'POST',
      path: '/admin/sync/runs/{id}/commit',
      inputStructure: 'detailed',
      summary: 'Apply a previewed run in one transaction (admin)',
    })
    .errors(commitErrors)
    .input(z.object({ params: z.object({ id: z.uuid() }) }))
    .output(syncCommitResponseSchema),

  getRun: admin
    .route({
      method: 'GET',
      path: '/admin/sync/runs/{id}',
      inputStructure: 'detailed',
      summary: 'Fetch one run and its plan (admin; plan is null once pruned)',
    })
    .errors({ 'run-not-found': commitErrors['run-not-found'] })
    .input(z.object({ params: z.object({ id: z.uuid() }) }))
    .output(
      z
        .object({ run: syncRunSchema, plan: syncPlanSchema.nullable() })
        .strict(),
    ),

  listRuns: admin
    .route({
      method: 'GET',
      path: '/admin/sync/runs',
      inputStructure: 'detailed',
      summary: 'List sync runs, newest first (admin)',
    })
    .input(
      z.object({
        query: z.object({ page: z.coerce.number().int().min(1).default(1) }),
      }),
    )
    .output(
      z
        .object({
          runs: z.array(syncRunSchema),
          total: z.number().int().nonnegative(),
          /** The newest *applied* run — the admin dashboard's "last sync". */
          lastApplied: syncRunSchema.nullable(),
        })
        .strict(),
    ),
};
