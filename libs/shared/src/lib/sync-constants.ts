/**
 * Catalog-sync limits. Plain data with no imports, so the sync screen does not
 * pull the sync schemas — and Zod — into its chunk (see `auth-constants.ts`
 * for why).
 */

/**
 * The key that addresses the base price list — `products.defaultPriceMinor`,
 * which is a column rather than a tier row, so no tier may claim this name.
 */
export const DEFAULT_PRICE_LIST_KEY = 'default';

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
