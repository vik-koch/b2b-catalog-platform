/** What every exchange area shares. Import-free, so a screen can take a limit
 * without pulling Zod into its chunk. */

/** The areas a run is filed under. Kept apart from `OWNERSHIP_AREAS`: a
 * manual import is a run in an area nobody else owns. */
export const SYNC_AREAS = ['catalog', 'customers', 'orders'] as const;
export type SyncArea = (typeof SYNC_AREAS)[number];

/** The area a request naming none is about. */
export const DEFAULT_SYNC_AREA: SyncArea = 'catalog';

/** A whole area in one request; a DoS bound well above any real one. */
export const SYNC_MAX_ROWS = 50_000;

/** Upper bound on an uploaded file (a DoS guard, not an editorial limit). */
export const SYNC_MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/** A preview's lists are capped so a first import stays a response; the
 * summary counts stay exact. */
export const SYNC_PREVIEW_MAX_ITEMS = 2000;

/** How many runs the history screen lists. */
export const SYNC_RUNS_PAGE_SIZE = 20;

/** Upper bound on a headless run's JSON body, a DoS guard. Its own body
 * parser on those routes alone, so the rest of the API keeps the default. */
export const SYNC_MAX_BODY_BYTES = 10 * 1024 * 1024;

/** Long enough for which file, which line, what broke; too short for a
 * stack trace. */
export const SYNC_FAILURE_MESSAGE_MAX_LENGTH = 500;

/** How a headless run labels itself where a manual one has a filename. */
export const SYNC_LABEL_MAX_LENGTH = 200;
