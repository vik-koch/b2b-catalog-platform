/**
 * Why personal data was destroyed (NFR-LEGAL-12). The first two are an
 * account deletion's own reasons (FR-AUTH-06, FR-ADM-23); a holder deleting
 * their account is a request too.
 */
export const DESTRUCTION_REASONS = [
  'request',
  'consent-withdrawn',
  'registration-declined',
  'retention-ended',
] as const;
export type DestructionReason = (typeof DESTRUCTION_REASONS)[number];

/** What a record names the person by: an account, or where none stands
 * behind the data, the consent record or the guest order itself. */
export const DESTRUCTION_SUBJECTS = ['account', 'consent', 'order'] as const;
export type DestructionSubject = (typeof DESTRUCTION_SUBJECTS)[number];

/**
 * The categories of personal data a destruction covers. Each act names the
 * categories it reaches, whether or not the person had anything in all of
 * them: an account with no saved address still had its address book
 * destroyed.
 */
export const DESTRUCTION_CATEGORIES = [
  /** Name, email, phone, company and pricing group on the account. */
  'account-details',
  'addresses',
  /** Contact, invoicing and delivery details and notes on orders. */
  'order-details',
  /** Files the shop supplied for those orders. */
  'order-documents',
  'consent-record',
] as const;
export type DestructionCategory = (typeof DESTRUCTION_CATEGORIES)[number];
