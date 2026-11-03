/**
 * Machine-token limits and vocabulary (NFR-SEC-09). Import-free so a component
 * showing a name's character counter does not pull Zod into the browser.
 */

/** An operator's label, not an identifier. */
export const API_TOKEN_NAME_MAX_LENGTH = 80;

/**
 * Capabilities, not routes: a new endpoint under one changes no token. Closed
 * in code, as a scope is a security boundary. A token holds a set, as one
 * client process usually does several jobs, and least privilege is in what
 * the operator ticks.
 */
export const API_TOKEN_SCOPES = [
  'catalog-sync',
  'customer-sync',
  'customer-read',
  'order-read',
  'order-sync',
] as const;
export type ApiTokenScope = (typeof API_TOKEN_SCOPES)[number];

/** The clear head kept in the row, so a listed token is recognisable. */
export const API_TOKEN_PREFIX_LENGTH = 8;

/** Bytes of randomness behind the prefix. */
export const API_TOKEN_SECRET_BYTES = 32;

/** Presented in the Authorization header, never a cookie or a URL. */
export const API_TOKEN_SCHEME = 'Bearer';
