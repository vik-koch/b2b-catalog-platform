/**
 * Product-document limits and expiry. Plain data with no imports, so a form
 * that needs one limit does not pull the document schemas, and Zod, along
 * with it. What an upload may be is the media store's (`media-constants.ts`).
 */

/** The title staff file a document under — what every list and link shows. */
export const DOCUMENT_TITLE_MAX_LENGTH = 200;

/** A document's external link (FR-DOC-05). Long enough for a register's query
 * string, short enough to bound the row. */
export const DOCUMENT_LINK_MAX_LENGTH = 2000;

/**
 * How many products one save may link a document to. Not a rule about
 * documents — FR-DOC-02 puts no number on it, and a certificate that covers a
 * whole range legitimately names hundreds of products — but a bound on the
 * body, so a malformed request cannot ask for an unbounded write.
 */
export const DOCUMENT_PRODUCTS_MAX = 2000;

/**
 * How many documents one product may be given in a single save. A product
 * carries a handful — a certificate, a declaration, a data sheet — and this is
 * a bound on the body rather than a rule about documents.
 */
export const PRODUCT_DOCUMENTS_MAX = 100;

/**
 * How long before its expiry date a document starts asking to be renewed
 * (FR-DOC-04). Fixed rather than configurable: it is the notice period a new
 * certificate takes to arrive, not a matter of taste, and a deployment that
 * wanted a different one would still be told at 30 days.
 */
export const DOCUMENT_EXPIRY_WARNING_DAYS = 30;

/**
 * The three states FR-DOC-04 names. A document with no expiry is `valid`:
 * nothing about it will ever come due, and every reader of this — the badge,
 * the filter, the storefront — wants it in the same bucket as one that is
 * still current.
 */
export const DOCUMENT_EXPIRY_STATES = ['valid', 'expiring', 'expired'] as const;
export type DocumentExpiryState = (typeof DOCUMENT_EXPIRY_STATES)[number];

/** One day, in milliseconds — the step this compares dates in. */
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Where a document stands, from its expiry date and today's, both as ISO days.
 *
 * Days rather than instants: an expiry is a date on a piece of paper, so a
 * document expires when the day named on it has passed, in the shop's own
 * reckoning, and never at a time of day. The comparison runs in UTC because
 * both sides are already plain days — parsing them in the server's zone would
 * make the answer depend on where the container runs.
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

/**
 * The one refusal this surface has. There is no delete guard: a document holds
 * no data anything else depends on, and deleting it is how an admin clears a
 * row that should never have been uploaded.
 */
export const DOCUMENT_ERROR_CODES = [
  'document-not-found',
  'document-product-not-found',
] as const;
export type DocumentErrorCode = (typeof DOCUMENT_ERROR_CODES)[number];
