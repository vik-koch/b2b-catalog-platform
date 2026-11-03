/** The customer exchange's vocabulary (FR-ADM-11/12/18), import-free like
 * `sync-constants.ts`. */

/** What a customer run can write (FR-ADM-11). Name and phone are the holder's,
 * seeded on create only (FR-ADM-15); a password never (FR-ADM-13). */
export const CUSTOMER_SYNC_FIELDS = ['email', 'tier', 'company'] as const;

/**
 * The customer CSV headers (FR-ADM-12): the row's own field names, as a file
 * and a submission encode one contract. An empty cell is "not in this file",
 * so a file cannot set a null (back to the base list, not a company): that
 * stays an admin edit, open whenever the upload is (FR-ADM-10).
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

/** The one required column: nothing matches without it (FR-ADM-14). */
export const CUSTOMER_SYNC_KEY_COLUMN: CustomerSyncCsvColumn = 'sourceId';

/** Spelled out, or `Boolean(cell)` reads the word "no" as true. */
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

/** One page of the outbound read (FR-ADM-18), and the default limit. */
export const CUSTOMER_READ_MAX_LIMIT = 200;
