/**
 * How a consent ended (NFR-LEGAL-09). The account consent ends with the
 * account: deleted, or, for a registration, declined and removed. Any other
 * withdrawal reaches the shop from outside and is entered by an admin.
 */
export const CONSENT_WITHDRAWAL_REASONS = [
  'account-deleted',
  'registration-declined',
  'entered',
] as const;
export type ConsentWithdrawalReason =
  (typeof CONSENT_WITHDRAWAL_REASONS)[number];

/** What an admin notes beside a withdrawal they enter: how it reached them. */
export const CONSENT_WITHDRAWAL_NOTE_MAX = 500;
