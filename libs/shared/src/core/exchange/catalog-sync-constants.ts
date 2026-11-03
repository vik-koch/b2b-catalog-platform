/** The catalog exchange's vocabulary, import-free like `sync-constants.ts`. */

/** What a bare `price` column means: the default list, whatever its key. No
 * tier key may contain `*`, so the differ resolves it against the database. */
export const DEFAULT_PRICE_LIST_ALIAS = '*';

/** The `sourceId` prefix of products made in the admin. No export carries
 * them, so the delete sweep keeps them. */
export const MANUAL_SOURCE_ID_PREFIX = 'manual:';

/** The non-price fields a run can write. */
export const CATALOG_SYNC_FIELDS = [
  'name',
  'category',
  'stock',
  'taxRate',
] as const;

/** The default when a run does not narrow the set. */
export const CATALOG_SYNC_ALL_FIELDS: (typeof CATALOG_SYNC_FIELDS)[number][] = [
  ...CATALOG_SYNC_FIELDS,
];
