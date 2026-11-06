/** Account vocabulary. Plain data with no imports, so a user list does not
 * pull Zod into its chunk. */

/**
 * Account lifecycle, mirroring the `user_status` pg enum. `invited`: approved,
 * a password link out. `disabled` can be switched back and keeps the name;
 * `anonymized` is final. `active` means exactly: a password its owner chose,
 * which is why switching back on lands on `invited`.
 */
export const USER_STATUSES = [
  'pending',
  'invited',
  'active',
  'disabled',
  'anonymized',
] as const;

/** Mirrors the `customer_type` pg enum; the config names the kinds a shop
 * accepts. */
export const CUSTOMER_TYPES = ['person', 'company'] as const;
export type CustomerType = (typeof CUSTOMER_TYPES)[number];

/** Which side of the account list a request wants: `customer` (`user` role)
 * or `staff`. A permission boundary: a manager only ever gets customers. */
export const USER_KINDS = ['customer', 'staff'] as const;

/** The list filter for "no registration number", in practice private
 * persons. Shares a parameter with `companyIdInput.formats`, so no format may
 * take the name. */
export const COMPANY_ID_NONE = 'none';

/** Why an admin deleted an account (FR-ADM-23), recorded because an erasure
 * the shop performs is one it may have to justify. */
export const ACCOUNT_DELETION_REASONS = [
  'request',
  'consent-withdrawn',
] as const;

/** The longest search the staff account list takes, in its field too. */
export const USER_QUERY_MAX_LENGTH = 200;
