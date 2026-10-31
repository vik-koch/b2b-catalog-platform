/** What every list and link shows. */
export const DOCUMENT_TITLE_MAX_LENGTH = 200;

/** A document's external link (FR-DOC-05). Long enough for a register's query
 * string, short enough to bound the row. */
export const DOCUMENT_LINK_MAX_LENGTH = 2000;

/** A bound on the body, not a rule: a certificate for a whole range names
 * hundreds of products. */
export const DOCUMENT_PRODUCTS_MAX = 2000;

/** A bound on a product save's body; a product carries a handful. */
export const PRODUCT_DOCUMENTS_MAX = 100;

/** How long before expiry a document asks to be renewed (FR-DOC-04): the
 * time a new certificate takes to arrive, not a matter of taste. */
export const DOCUMENT_EXPIRY_WARNING_DAYS = 30;

/** The states FR-DOC-04 names. No expiry is `valid`: nothing comes due. */
export const DOCUMENT_EXPIRY_STATES = ['valid', 'expiring', 'expired'] as const;
export type DocumentExpiryState = (typeof DOCUMENT_EXPIRY_STATES)[number];

/** One day, in milliseconds. */
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Where a document stands, from its expiry and today, both ISO days. An expiry
 * is a date on paper, so it passes with the day, never at a time of day.
 * Compared in UTC: in the server's zone the answer would depend on where the
 * container runs.
 */
export function documentExpiryState(
  expiresAt: string | null,
  today: string,
): DocumentExpiryState {
  if (!expiresAt) return 'valid';
  if (expiresAt < today) return 'expired';
  const days = (Date.parse(expiresAt) - Date.parse(today)) / DAY_MS;
  return days <= DOCUMENT_EXPIRY_WARNING_DAYS ? 'expiring' : 'valid';
}

/** No delete guard: nothing depends on a document's data. */
export const DOCUMENT_ERROR_CODES = [
  'document-not-found',
  'document-product-not-found',
] as const;
export type DocumentErrorCode = (typeof DOCUMENT_ERROR_CODES)[number];
