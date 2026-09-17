/**
 * Catalog-sync limits. Plain data with no imports, so the sync screen does not
 * pull the sync schemas — and Zod — into its chunk (see `auth-constants.ts`
 * for why).
 */

/**
 * What a bare `price` column means: whichever list carries the default badge,
 * whatever it is keyed. A file with one price column addresses the shop's own
 * front price without having to know its name.
 *
 * Not a key, and deliberately unspellable as one — no tier key may contain
 * `*` — so the parser can hand it on and the differ, which can see the
 * database, resolves it to the badged tier. No key is reserved any more: a
 * list named `default` is addressed as `price:default` like any other.
 */
export const DEFAULT_PRICE_LIST_ALIAS = '*';

/**
 * The areas of the platform's data an exchange can carry, and the vocabulary
 * every run is filed under.
 *
 * One list, one run table, one set of screens parameterised by it: the run
 * lifecycle, the staged reasons, the actor, the counts and the notifications
 * are the same whatever is being exchanged, and only the row payload and the
 * owned fields differ (ADR 0060).
 *
 * Wider than `OWNERSHIP_AREAS` on purpose: a run can exist for an area no
 * external system owns yet — that is what a manual import is — so the two
 * lists answer different questions and converge only by coincidence.
 */
export const SYNC_AREAS = ['catalog', 'customers'] as const;
export type SyncArea = (typeof SYNC_AREAS)[number];

/** What a caller that predates areas was asking about, and still is. */
export const DEFAULT_SYNC_AREA: SyncArea = 'catalog';

/** A whole catalog in one request, with a DoS bound well above any real one. */
export const SYNC_MAX_ROWS = 50_000;

/** Upper bound on an uploaded file (a DoS guard, not an editorial limit). */
export const SYNC_MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/**
 * `sourceId` prefix for products created in the admin UI rather than by an
 * import. They are absent from every real export by construction, so the
 * delete sweep skips them and reports them as kept.
 */
export const MANUAL_SOURCE_ID_PREFIX = 'manual:';

/** Per-entity lists are capped so a first-import preview stays a response, not
 * a download; the summary counts remain exact. */
export const SYNC_PREVIEW_MAX_ITEMS = 2000;

/** How many runs the history screen lists. */
export const SYNC_RUNS_PAGE_SIZE = 20;

/** The non-price fields a run can write, and the source `syncFieldSchema` is
 * built from — the list is stated once. */
export const SYNC_FIELDS = ['name', 'category', 'stock'] as const;

/** All of them: the default when a run does not narrow the set. */
export const SYNC_ALL_FIELDS: (typeof SYNC_FIELDS)[number][] = [...SYNC_FIELDS];

/**
 * What a customer run can write (FR-ADM-11), and the source
 * `customerSyncFieldSchema` is built from.
 *
 * Shorter than it looks at first glance, and each absence is a decision. A
 * customer's **name and phone number** are not here: they are the account
 * holder's own to maintain and travel outward only (FR-ADM-15), so a run seeds
 * them when it asks an account into being and can never write them again. A
 * **password** is not here and never will be (FR-ADM-13). And there is no field
 * for deletion, because the exchange has no way to delete.
 */
export const CUSTOMER_SYNC_FIELDS = ['email', 'tier', 'company'] as const;
export type CustomerSyncFieldName = (typeof CUSTOMER_SYNC_FIELDS)[number];

/**
 * Upper bound on a headless run's JSON body. The same order as the upload
 * limit beside it and for the same reason — a DoS guard, not an editorial
 * one — but it is enforced by a body parser mounted on that route alone: the
 * rest of the API keeps the default, so one machine endpoint does not widen
 * every other one to ten megabytes.
 */
export const SYNC_MAX_BODY_BYTES = 10 * 1024 * 1024;

/**
 * How much of an automated client's own failure text is kept. Long enough for
 * the sentence a person needs — which file, which line, what broke — and short
 * enough that a stack trace cannot fill the log.
 */
export const SYNC_FAILURE_MESSAGE_MAX_LENGTH = 500;

/** How a headless run labels itself where a manual one has a filename. */
export const SYNC_LABEL_MAX_LENGTH = 200;

/**
 * CSV column headers for a customer import (FR-ADM-12), so the parser, a
 * deployment's converter and the admin help text agree on one spelling.
 *
 * The names are the row's own field names rather than friendlier ones, because
 * a file and a headless submission are two encodings of one contract and a
 * second vocabulary would have to be translated by whoever wrote the export.
 * The header row is required and order-independent; `sourceId` is the only
 * column a file must carry.
 *
 * An empty cell means "not in this file" and never "clear this field", exactly
 * as it does for the catalog. The consequence worth stating: the fields where
 * null is a real value — the base price list, a customer who is not a company —
 * cannot be *set* to it from a file, because a spreadsheet cannot tell an empty
 * cell from an absent one. Moving somebody back to the base list stays an admin
 * panel edit, which is open by definition whenever this upload is (FR-ADM-10).
 */
export const CUSTOMER_SYNC_CSV_COLUMNS = [
  'sourceId',
  'email',
  'access',
  'tierKey',
  'customerType',
  'companyName',
  'companyRegistrationId',
  'firstName',
  'lastName',
  'phone',
  'sendPasswordLink',
] as const;
export type CustomerSyncCsvColumn = (typeof CUSTOMER_SYNC_CSV_COLUMNS)[number];

/** The one column a customer file cannot leave out: nothing can be matched
 * without it (FR-ADM-14). */
export const CUSTOMER_SYNC_KEY_COLUMN: CustomerSyncCsvColumn = 'sourceId';

/**
 * What a cell may say for a yes/no column. Written out rather than trusting
 * `Boolean(cell)`, because a spreadsheet's idea of a boolean is whatever the
 * person typing was in the mood for, and the alternative is a silent `true`
 * for the word "no".
 */
export const CUSTOMER_SYNC_TRUE_VALUES: readonly string[] = [
  'true',
  'yes',
  '1',
];
export const CUSTOMER_SYNC_FALSE_VALUES: readonly string[] = [
  'false',
  'no',
  '0',
];

/**
 * The most accounts one page of the outbound read carries (FR-ADM-18), and
 * also its default: a puller wants whole pages, and a client that names no
 * limit is asking for as much as it can get.
 */
export const CUSTOMER_READ_MAX_LIMIT = 200;
