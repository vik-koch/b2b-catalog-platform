/**
 * Catalog-sync limits and vocabulary. Plain data with no imports, so the sync
 * screen does not pull the sync schemas — and Zod — into its chunk (see
 * `auth-constants.ts` for why).
 *
 * What every area shares is one file out, in `sync-constants.ts`; the customer
 * exchange's own is in `customer-sync-constants.ts`. Three files rather than
 * one so that importing a limit says which area you are in, and a customer
 * screen cannot reach a catalog field list by accident.
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
 * `sourceId` prefix for products created in the admin UI rather than by an
 * import. They are absent from every real export by construction, so the
 * delete sweep skips them and reports them as kept.
 */
export const MANUAL_SOURCE_ID_PREFIX = 'manual:';

/** The non-price fields a run can write, and the source `catalogSyncFieldSchema` is
 * built from — the list is stated once. */
export const CATALOG_SYNC_FIELDS = ['name', 'category', 'stock'] as const;

/** All of them: the default when a run does not narrow the set. */
export const CATALOG_SYNC_ALL_FIELDS: (typeof CATALOG_SYNC_FIELDS)[number][] = [
  ...CATALOG_SYNC_FIELDS,
];
