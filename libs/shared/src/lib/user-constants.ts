/**
 * Account vocabulary the admin screens read. Plain data with no imports, so a
 * user list does not pull the user schemas — and Zod — into its chunk (see
 * `auth-constants.ts` for why).
 */

/**
 * Account lifecycle, mirroring the `user_status` pg enum. `invited` is a real
 * state rather than a derived one: staff have approved the account and a
 * set-your-password link is out, but nothing can sign in until it is redeemed.
 *
 * `disabled` and `anonymized` are the two ways an account stops being usable,
 * and they are not interchangeable: **disabled** is a switch staff can flip
 * back (the colleague who left, the customer who stopped ordering) and keeps
 * the person's name, so the audit trail and every `approvedBy` reference still
 * name somebody; **anonymized** erases who they were and is final.
 *
 * Switching an account off retires its password, so the way back on is
 * `invited` — never straight to `active`. That keeps every status honest about
 * one thing: an account is `active` exactly when it holds a password its owner
 * chose.
 */
export const USER_STATUSES = [
  'pending',
  'invited',
  'active',
  'disabled',
  'anonymized',
] as const;

/**
 * Which side of the account list a request wants: `customer` accounts (`user`
 * role) or `staff` (admin and manager). The split is a real permission boundary,
 * not just a view — a manager may only ever see customers, enforced server-side
 * regardless of what is asked for (see StaffUsersController).
 */
export const USER_KINDS = ['customer', 'staff'] as const;

/**
 * The account-list filter value meaning "no registration number at all" —
 * in practice, the private persons. Reserved rather than derived: it sits in
 * the same parameter as the `companyIdInput.formats` keys, so a deployment must
 * not use it as one.
 */
export const COMPANY_ID_NONE = 'none';
