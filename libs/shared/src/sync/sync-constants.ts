/**
 * What every sync area shares, whatever it carries. Plain data with no imports,
 * so a screen can take a limit without pulling Zod into its chunk (see
 * `auth-constants.ts` for why).
 *
 * The line between this file and the two beside it — `catalog-sync-constants.ts`
 * and `customer-sync-constants.ts` — is the same one the run contract draws: a
 * run's lifecycle, its bounds and the areas themselves are common; what a row
 * is never is.
 */

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
export const SYNC_AREAS = ['catalog', 'customers', 'orders'] as const;
export type SyncArea = (typeof SYNC_AREAS)[number];

/** What a caller that predates areas was asking about, and still is. */
export const DEFAULT_SYNC_AREA: SyncArea = 'catalog';

/** A whole area in one request, with a DoS bound well above any real one —
 * a catalog of everything the shop sells, or a customer list. */
export const SYNC_MAX_ROWS = 50_000;

/** Upper bound on an uploaded file (a DoS guard, not an editorial limit). */
export const SYNC_MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/** Per-entity lists are capped so a first-import preview stays a response, not
 * a download; the summary counts remain exact. */
export const SYNC_PREVIEW_MAX_ITEMS = 2000;

/** How many runs the history screen lists. */
export const SYNC_RUNS_PAGE_SIZE = 20;

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
