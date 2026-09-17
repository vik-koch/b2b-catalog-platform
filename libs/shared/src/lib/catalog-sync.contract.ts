import { oc } from '@orpc/contract';
import * as z from 'zod';
import {
  CATALOG_SYNC_ALL_FIELDS,
  CATALOG_SYNC_FIELDS,
} from './catalog-sync-constants';
import {
  SYNC_FAILURE_MESSAGE_MAX_LENGTH,
  SYNC_LABEL_MAX_LENGTH,
  SYNC_MAX_ROWS,
} from './sync-constants';
import { ownershipErrors } from './ownership-constants';
import {
  syncFailureReportSchema,
  syncRunSchema,
  syncSummarySchema,
} from './sync-run.contract';
import { machineAuthErrors } from './api-tokens.contract';
import { priceMinorSchema } from './catalog.contract';
import {
  CATEGORY_NAME_MAX_LENGTH,
  PRODUCT_NAME_MAX_LENGTH,
  SOURCE_ID_MAX_LENGTH,
} from './catalog-constants';
import { TIER_KEY_MAX_LENGTH } from './tier-constants';

/**
 * The bulk catalog sync: the rows a run carries and the diff it computes.
 *
 * This file is the *import contract*: the row shape a run consumes and the
 * per-run intent that decides what a run may write. It is deliberately
 * independent of both the public read contract and the storage schema,
 * and it is the one shape promised to stay stable — a client-specific converter
 * turns the raw export into it, so a changing export costs an adapter,
 * never a contract change.
 *
 * CSV and JSON are two *encodings* of the same rows; both decode into
 * `CatalogSyncRow[]` and run through the same validator, differ and applier.
 *
 * What is **not** here is everything a run has in common with a customer run:
 * the run record, its statuses and counts (`sync-run.contract.ts`) and the
 * routes that read, apply and discard one (`sync.contract.ts`), which serve
 * every area from one screen. The seam is the same one the API draws — a
 * shared run controller over a service per area.
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
export const catalogSyncPriceListKeySchema = z
  .string()
  .trim()
  .min(1)
  .max(TIER_KEY_MAX_LENGTH);
export type CatalogSyncPriceListKey = string;

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
    /**
     * Per price list, in minor units. Only the keys present are written: a
     * file that carries `price:wholesale` and nothing else leaves the base
     * price and every other list untouched.
     *
     * A zero is refused as a row error rather than by this schema: it is a
     * mistake in one line of a file, and one bad line never fails a whole
     * catalog here.
     */
    prices: z
      .record(catalogSyncPriceListKeySchema, priceMinorSchema)
      .optional(),
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
export type CatalogSyncRow = z.infer<typeof catalogSyncRowSchema>;

// --- CSV encoding --------------------------------------------------------

/**
 * CSV column headers, so the parser, the converter and the admin help text
 * agree on one spelling. The header row is required and order-independent;
 * price columns are `price:<listKey>`, with a bare `price` accepted as an alias
 * for `price:default` so a single-price export stays readable in a spreadsheet.
 * Which list keys exist is a per-deployment question, so the parser accepts any
 * `price:` column and the validator decides whether it names a tier.
 */
export const CATALOG_SYNC_CSV_COLUMNS = {
  sourceId: 'sourceId',
  name: 'name',
  categorySourceId: 'categorySourceId',
  categoryName: 'categoryName',
  price: 'price',
  pricePrefix: 'price:',
  stock: 'stock',
} as const;

/** `price:default` etc. — the canonical spelling of a price column. */
export function syncPriceColumn(key: CatalogSyncPriceListKey): string {
  return `${CATALOG_SYNC_CSV_COLUMNS.pricePrefix}${key}`;
}

// --- Per-run intent ------------------------------------------------------

/**
 * Non-price fields a run may write. Prices are self-describing (a run writes
 * exactly the price-list keys its rows carry), so they are not listed here.
 */
export const catalogSyncFieldSchema = z.enum(CATALOG_SYNC_FIELDS);
export type CatalogSyncField = z.infer<typeof catalogSyncFieldSchema>;

/**
 * What a run is allowed to do. Anything not declared here is not written, so a
 * price-only run can never clobber an admin's rename.
 *
 * The one dangerous option is gated: `softDeleteMissingProducts` requires
 * `productSetAuthoritative` — an explicit claim that the file is the *complete*
 * catalog. Authority over the product set, not the size of the field set, is
 * the precondition deletion actually needs.
 */
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
export type CatalogSyncOptions = z.infer<typeof catalogSyncOptionsSchema>;

// --- The diff ------------------------------------------------------------

/** One field's before → after. Prices arrive as minor-unit numbers so the UI
 * can format them with the deployment's currency; everything else is text. */
export const catalogSyncFieldChangeSchema = z
  .object({
    /** `name`, `category`, or `price:<listKey>`. */
    field: z.string(),
    from: z.union([z.string(), z.number(), z.null()]),
    to: z.union([z.string(), z.number(), z.null()]),
  })
  .strict();
export type CatalogSyncFieldChange = z.infer<
  typeof catalogSyncFieldChangeSchema
>;

export const catalogSyncProductChangeSchema = z
  .object({
    kind: z.enum(['create', 'update', 'softDelete', 'restore']),
    sourceId: z.string(),
    /** The product's name after the run (or its current one, for a delete). */
    name: z.string(),
    /** Null for a product this run creates — it has no URL yet. */
    slug: z.string().nullable(),
    /** Empty for create/softDelete/restore, which are self-describing. */
    changes: z.array(catalogSyncFieldChangeSchema),
  })
  .strict();
export type CatalogSyncProductChange = z.infer<
  typeof catalogSyncProductChangeSchema
>;

export const catalogSyncCategoryChangeSchema = z
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
export type CatalogSyncCategoryChange = z.infer<
  typeof catalogSyncCategoryChangeSchema
>;

/** A category left with no live products by this run. Reported only — removal
 * is a deliberate admin action (FR-ADM-01), never a sync's. */
export const catalogSyncEmptiedCategorySchema = z
  .object({ slug: z.string(), name: z.string() })
  .strict();

/**
 * Why one row was skipped. Same discipline as every other refusal: a code the
 * screen switches on, with `params` naming the things in the admin's own file
 * that the sentence has to quote back at them.
 */
export const CATALOG_SYNC_ROW_ERROR_CODES = [
  'missing-source-id',
  /** The same sourceId twice in one file. */
  'duplicate-source-id',
  /** `{category}` — one half of the category pair without the other. */
  'category-id-without-name',
  'category-name-without-id',
  /** `{price}` and `{column}` */
  'price-not-an-integer',
  /** `{column}` — a zero price, which is no price rather than a free product. */
  'price-is-zero',
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
export type CatalogSyncRowErrorCode =
  (typeof CATALOG_SYNC_ROW_ERROR_CODES)[number];

/** A row that could not be applied. The run still previews and commits; these
 * rows are skipped, so one bad line never fails a whole catalog. */
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
    /** Kept `manual:` products, for an informed exclusion rather than a silent one. */
    keptManual: z.array(
      z.object({ sourceId: z.string(), name: z.string() }).strict(),
    ),
    rowErrors: z.array(catalogSyncRowErrorSchema),
    /** True when any list above was capped at SYNC_PREVIEW_MAX_ITEMS. */
    truncated: z.boolean(),
  })
  .strict();
export type CatalogSyncPlan = z.infer<typeof catalogSyncPlanSchema>;

/** What a preview returns: the staged run plus the plan it computed. */
export const catalogSyncPreviewResponseSchema = z
  .object({ run: syncRunSchema, plan: catalogSyncPlanSchema })
  .strict();
export type CatalogSyncPreviewResponse = z.infer<
  typeof catalogSyncPreviewResponseSchema
>;

// --- The headless surface ------------------------------------------------

/**
 * What an automated client submits (FR-ADM-07). The same rows and the same
 * per-run intent a manual upload carries — this is one entry point onto one
 * engine, not a second importer — encoded as JSON rather than as a file,
 * because the thing on the other end is a converter and not a spreadsheet.
 */
export const catalogSyncSubmissionSchema = z
  .object({
    rows: z.array(catalogSyncRowSchema).max(SYNC_MAX_ROWS),
    /** Absent means the defaults, exactly as an upload's absent options do. */
    options: catalogSyncOptionsSchema.optional(),
    /**
     * What to call this run in the log, where an upload has a filename. The
     * caller's own words — a source file's name, an export's timestamp — kept
     * as a label and never interpreted.
     */
    label: z.string().trim().min(1).max(SYNC_LABEL_MAX_LENGTH).optional(),
    /**
     * "Stage this even if it would otherwise apply." A client sets it when it
     * cannot fully vouch for what it parsed. The platform does not ask why:
     * knowing the reason would mean knowing the format, which is the adapter's
     * business and deliberately not this repository's.
     */
    requestReview: z.boolean().default(false),
    /**
     * Anything the caller wants a person to read beside this run, in its own
     * words. It is the counterpart of a failure report for a run that did
     * produce rows: what it had to leave out, what looked stale, why it asked
     * to be doubted. Recorded and shown, never parsed — and on its own it
     * decides nothing, so a client can explain itself without its run being
     * held back for it. `requestReview` remains the only way to ask for that.
     */
    notice: z
      .string()
      .trim()
      .min(1)
      .max(SYNC_FAILURE_MESSAGE_MAX_LENGTH)
      .optional(),
  })
  .strict();
export type CatalogSyncSubmission = z.infer<typeof catalogSyncSubmissionSchema>;

/**
 * What a submitted run answers with: the run, and the diff it staged or
 * applied. `run.status` is what the caller reads — `applied` means the catalog
 * has moved, `previewed` means a person now has to look, and `run.stagedReason`
 * says which of the two reasons that was.
 */
export const catalogSyncSubmitResponseSchema = z
  .object({ run: syncRunSchema, plan: catalogSyncPlanSchema })
  .strict();
export type CatalogSyncSubmitResponse = z.infer<
  typeof catalogSyncSubmitResponseSchema
>;

/** Authenticated by the token alone; no cookie reaches these. */
const machine = oc.errors({
  ...machineAuthErrors,
  // The other half of the mutual exclusion: while nobody has handed the
  // catalog over, the shop is writing it by hand and an automated client is
  // not welcome to. Distinct from the auth refusals beside it — the token is
  // good, the platform is simply not listening on this area.
  'catalog-not-externally-owned':
    ownershipErrors['catalog-not-externally-owned'],
});

/**
 * The machine half of the sync surface: submit a catalog, or report that you
 * could not produce one.
 *
 * There is deliberately no commit route here. An automated client never
 * presses apply — either its run was within the deployment's policy and
 * applied itself, or a person applies it.
 */
export const machineCatalogSyncContract = {
  submitRun: machine
    .route({
      method: 'POST',
      path: '/machine/sync/runs',
      // A run is created whichever way the policy decides, exactly as the
      // upload creates one.
      successStatus: 201,
      inputStructure: 'detailed',
      summary: 'Submit a catalog import (machine)',
    })
    .input(z.object({ body: catalogSyncSubmissionSchema }))
    .output(catalogSyncSubmitResponseSchema),

  /**
   * A run that never happened, recorded so that a broken exchange looks like
   * something rather than like silence. A feed that stops sending is
   * indistinguishable from a feed with nothing to send; this is how the
   * difference reaches the admin panel.
   */
  reportFailure: machine
    .route({
      method: 'POST',
      path: '/machine/sync/failures',
      successStatus: 201,
      inputStructure: 'detailed',
      summary: 'Record a run that failed before it began (machine)',
    })
    .input(z.object({ body: syncFailureReportSchema }))
    .output(z.object({ run: syncRunSchema }).strict()),
};
