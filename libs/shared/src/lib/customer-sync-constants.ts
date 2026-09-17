/**
 * Customer-exchange limits and vocabulary (FR-ADM-11/12/18). Plain data with no
 * imports, for the same reason its catalog counterpart is — see
 * `catalog-sync-constants.ts`, and `sync-constants.ts` for what both areas
 * share.
 */

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
