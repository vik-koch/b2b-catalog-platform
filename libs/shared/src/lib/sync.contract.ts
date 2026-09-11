import { oc } from '@orpc/contract';
import * as z from 'zod';
import {
  SYNC_ALL_FIELDS,
  SYNC_FAILURE_MESSAGE_MAX_LENGTH,
  SYNC_FIELDS,
  SYNC_LABEL_MAX_LENGTH,
  SYNC_MAX_ROWS,
} from './sync-constants';
import { machineAuthErrors } from './api-tokens.contract';
import { commonAuthErrors } from './api-error';
import { ownershipErrors } from './ownership-constants';
import { paginationSchema, priceMinorSchema } from './catalog.contract';
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
    /**
     * Which fields this run rewrote, as they are named in a change:
     * `name`, `category`, `stock`, `price:<listKey>`. The counts say how much a
     * run did; this says *what* it does, which for a feed that runs every
     * twenty minutes is the more useful of the two.
     *
     * Only rewrites: a product this run creates writes everything it carries by
     * definition, and the create count already says so. Defaulted, so summaries
     * stored before this existed still parse.
     */
    fields: z.array(z.string()).default([]),
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

/**
 * Where a run ended up.
 *
 * `previewed` is staged and still applicable; `superseded` and `discarded` are
 * both staged runs that never will be, kept apart because they are different
 * sentences — the newer run replaced this one, or a person said no to it. Both
 * stay in the log: a preview nobody applied is part of the record.
 */
export const syncRunStatusSchema = z.enum([
  'previewed',
  'applied',
  'failed',
  /**
   * The source and the catalog already agree. Terminal from the moment it is
   * computed: there is nothing to apply, so there is no decision to put in
   * front of anybody — and a queue holding runs with nothing in them is a
   * queue that stops being read. A run that skipped rows is never this,
   * however empty its diff: "nothing happened" and "the file could not be read
   * and so nothing happened" are opposite pieces of news.
   */
  'no-change',
  'superseded',
  'discarded',
]);
export type SyncRunStatus = z.infer<typeof syncRunStatusSchema>;

/** How the run entered the system: an admin's upload, or a machine token. */
export const syncRunSourceSchema = z.enum(['upload', 'api']);

/**
 * Why a run was left for a person instead of applying itself (ADR 0055).
 * `policy` — its effect was outside what the deployment lets a run do
 * unattended. `requested` — the caller asked to be doubted, which it does when
 * it cannot fully vouch for what it parsed. The screen has to say which, or an
 * ordinary large import and one whose parsing is suspect look the same.
 */
export const syncStagedReasonSchema = z.enum(['policy', 'requested']);
export type SyncStagedReason = z.infer<typeof syncStagedReasonSchema>;

export const syncRunSchema = z
  .object({
    id: z.uuid(),
    status: syncRunStatusSchema,
    source: syncRunSourceSchema,
    filename: z.string().nullable(),
    startedAt: z.iso.datetime(),
    finishedAt: z.iso.datetime().nullable(),
    /** Who ran it; null if that account has since been deleted, and null for
     * a machine run, which has no person behind it at all. */
    actorEmail: z.string().nullable(),
    /** The token that submitted it, by name. Null for an upload. Denormalized
     * like `actorEmail`, so the trail still names the credential after it is
     * revoked and renamed out of use. */
    tokenName: z.string().nullable(),
    /** Set only while a run is staged, or was staged and then ended without
     * being applied. Null on anything that applied itself. */
    stagedReason: syncStagedReasonSchema.nullable(),
    /** Null on a run that failed before it had any: an automated client's
     * report of its own breakage is a run that never got as far as intent. */
    options: syncOptionsSchema.nullable(),
    summary: syncSummarySchema.nullable(),
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
  /**
   * Not a fault in the file: the catalog is externally owned (FR-ADM-10) and
   * the manual upload is closed. It travels here because the upload is
   * multipart with a single refusal channel, and the screen needs to say this
   * sentence rather than a generic one.
   */
  'catalog-externally-owned',
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
  /** There was nothing in it to apply. */
  'run-no-change',
  /** A newer run from the same source replaced this one's diff. */
  'run-superseded',
  /** An admin already decided against it. */
  'run-discarded',
  /** Staged rows pruned; the diff cannot be recomputed, so re-upload. */
  'run-rows-pruned',
  /**
   * An uploaded run staged before the catalog was handed over, and applied
   * after. Applying is the write, so it is judged by the setting in force now,
   * not the one in force when the file went up. Machine runs are unaffected:
   * they can only exist while the catalog *is* owned.
   */
  'catalog-externally-owned',
] as const;
export type SyncCommitCode = (typeof SYNC_COMMIT_CODES)[number];

/** A run nobody staged is a 404; one that cannot be applied is a conflict. */
const commitErrors = {
  'run-not-found': { status: 404 },
  'run-already-applied': { status: 409 },
  'run-failed': { status: 409 },
  'run-no-change': { status: 409 },
  'run-superseded': { status: 409 },
  'run-discarded': { status: 409 },
  'run-rows-pruned': { status: 409 },
  'catalog-externally-owned': ownershipErrors['catalog-externally-owned'],
} as const satisfies Record<SyncCommitCode, { status: number }>;

/** The refusals a run this screen acts on can answer with — the same set for
 * applying and for discarding, since both need a run that is still staged. */
const runActionErrors = commitErrors;

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

  /**
   * Give up on a staged run. The row stays, marked as the decision it was:
   * without this the only way a preview leaves the queue is the next run
   * replacing it, and a work-awaiting count nobody can clear is a count
   * nobody reads.
   */
  discardRun: admin
    .route({
      method: 'POST',
      path: '/admin/sync/runs/{id}/discard',
      inputStructure: 'detailed',
      summary: 'Give up on a staged run (admin)',
    })
    .errors(runActionErrors)
    .input(z.object({ params: z.object({ id: z.uuid() }) }))
    .output(z.object({ run: syncRunSchema }).strict()),

  listRuns: admin
    .route({
      method: 'GET',
      path: '/admin/sync/runs',
      inputStructure: 'detailed',
      summary: 'List sync runs, newest first (admin)',
    })
    .input(
      z.object({
        query: z.object({
          page: z.coerce.number().int().min(1).default(1),
          /** Narrows the list to one outcome — what the panel's staged-run
           * count links into. Absent is every run. */
          status: syncRunStatusSchema.optional(),
        }),
      }),
    )
    .output(
      z
        .object({
          runs: z.array(syncRunSchema),
          pagination: paginationSchema,
          /** The newest *applied* run — the admin dashboard's "last sync".
           * Answered whatever the list is narrowed to: it is a fact about the
           * catalog, not about the page being read. */
          lastApplied: syncRunSchema.nullable(),
        })
        .strict(),
    ),
};

// --- The headless surface ------------------------------------------------

/**
 * What an automated client submits (FR-ADM-07). The same rows and the same
 * per-run intent a manual upload carries — this is one entry point onto one
 * engine, not a second importer — encoded as JSON rather than as a file,
 * because the thing on the other end is a converter and not a spreadsheet.
 */
export const syncSubmissionSchema = z
  .object({
    rows: z.array(syncRowSchema).max(SYNC_MAX_ROWS),
    /** Absent means the defaults, exactly as an upload's absent options do. */
    options: syncOptionsSchema.optional(),
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
  })
  .strict();
export type SyncSubmission = z.infer<typeof syncSubmissionSchema>;

/**
 * A breakage the caller wants recorded (NFR-OPS-07). It is not a refusal the
 * platform issued, so it carries no code: it is the automated client's own
 * account of what went wrong, kept verbatim for a person to read, the way a
 * failed run's `error` already is.
 */
export const syncFailureReportSchema = z
  .object({
    message: z.string().trim().min(1).max(SYNC_FAILURE_MESSAGE_MAX_LENGTH),
    label: z.string().trim().min(1).max(SYNC_LABEL_MAX_LENGTH).optional(),
  })
  .strict();
export type SyncFailureReport = z.infer<typeof syncFailureReportSchema>;

/**
 * What a submitted run answers with: the run, and the diff it staged or
 * applied. `run.status` is what the caller reads — `applied` means the catalog
 * has moved, `previewed` means a person now has to look, and `run.stagedReason`
 * says which of the two reasons that was.
 */
export const syncSubmitResponseSchema = z
  .object({ run: syncRunSchema, plan: syncPlanSchema })
  .strict();
export type SyncSubmitResponse = z.infer<typeof syncSubmitResponseSchema>;

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
export const machineSyncContract = {
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
    .input(z.object({ body: syncSubmissionSchema }))
    .output(syncSubmitResponseSchema),

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
