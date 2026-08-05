import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import { priceMinorSchema } from './catalog.contract';
import {
  CATEGORY_NAME_MAX_LENGTH,
  PRODUCT_NAME_MAX_LENGTH,
  SOURCE_ID_MAX_LENGTH,
} from './admin-catalog.contract';
import { TIER_KEY_MAX_LENGTH } from './tiers.contract';

const c = initContract();

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
 * The key that addresses the base price list — `products.defaultPriceMinor`,
 * which is a column rather than a tier row, so no tier may claim this name.
 */
export const DEFAULT_PRICE_LIST_KEY = 'default';

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

/** A whole catalog in one request, with a DoS bound well above any real one. */
export const SYNC_MAX_ROWS = 50_000;

/** Upper bound on an uploaded file (a DoS guard, not an editorial limit). */
export const SYNC_MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

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
export const syncFieldSchema = z.enum(['name', 'category']);
export type SyncField = z.infer<typeof syncFieldSchema>;
export const SYNC_ALL_FIELDS: SyncField[] = ['name', 'category'];

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

/**
 * `sourceId` prefix for products created in the admin UI rather than by an
 * import. They are absent from every real export by construction, so the
 * delete sweep skips them and reports them as kept.
 */
export const MANUAL_SOURCE_ID_PREFIX = 'manual:';

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

/** A row that could not be applied. The run still previews and commits; these
 * rows are skipped, so one bad line never fails a whole catalog. */
export const syncRowErrorSchema = z
  .object({
    /** 1-based line number in the uploaded file (header excluded). */
    row: z.number().int().positive(),
    sourceId: z.string().nullable(),
    message: z.string(),
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

/** Per-entity lists are capped so a first-import preview stays a response, not
 * a download; the summary counts remain exact. */
export const SYNC_PREVIEW_MAX_ITEMS = 2000;

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
    id: z.string().uuid(),
    status: syncRunStatusSchema,
    source: syncRunSourceSchema,
    filename: z.string().nullable(),
    startedAt: z.string().datetime(),
    finishedAt: z.string().datetime().nullable(),
    /** Who ran it; null if that account has since been deleted. */
    actorEmail: z.string().nullable(),
    options: syncOptionsSchema,
    summary: syncSummarySchema,
    error: z.string().nullable(),
  })
  .strict();
export type SyncRun = z.infer<typeof syncRunSchema>;

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

/** How many runs the history screen lists. */
export const SYNC_RUNS_PAGE_SIZE = 20;

const messageSchema = z.object({ message: z.string() }).strict();

/**
 * The JSON half of the sync surface. The preview *upload* is not here: it is
 * multipart/form-data, which the JSON-oriented contracts do not model, so it
 * lives on a plain Nest handler that returns `SyncPreviewResponse` (the same
 * split the media upload uses).
 */
export const syncContract = c.router(
  {
    commitRun: {
      method: 'POST',
      path: '/admin/sync/runs/:id/commit',
      pathParams: z.object({ id: z.string().uuid() }),
      // No payload; an empty object is the repo's no-body POST convention.
      body: z.object({}),
      responses: {
        200: syncCommitResponseSchema,
        404: messageSchema,
        // Already committed, failed, or its staged rows were pruned.
        409: messageSchema,
      },
      summary: 'Apply a previewed run in one transaction (admin)',
    },
    getRun: {
      method: 'GET',
      path: '/admin/sync/runs/:id',
      pathParams: z.object({ id: z.string().uuid() }),
      responses: {
        200: z
          .object({ run: syncRunSchema, plan: syncPlanSchema.nullable() })
          .strict(),
        404: messageSchema,
      },
      summary: 'Fetch one run and its plan (admin; plan is null once pruned)',
    },
    listRuns: {
      method: 'GET',
      path: '/admin/sync/runs',
      query: z.object({ page: z.coerce.number().int().min(1).default(1) }),
      responses: {
        200: z
          .object({
            runs: z.array(syncRunSchema),
            total: z.number().int().nonnegative(),
            /** The newest *applied* run — the admin dashboard's "last sync". */
            lastApplied: syncRunSchema.nullable(),
          })
          .strict(),
      },
      summary: 'List sync runs, newest first (admin)',
    },
  },
  {
    commonResponses: { 401: messageSchema, 403: messageSchema },
  },
);
