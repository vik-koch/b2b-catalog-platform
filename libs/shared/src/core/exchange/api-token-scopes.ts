/** What a machine token may do (NFR-SEC-09). Import-free, so a name's
 * character counter does not pull Zod in. */

/** An operator's label, not an identifier. */
export const API_TOKEN_NAME_MAX_LENGTH = 80;

/**
 * Capabilities, not routes: a new endpoint under one changes no token. A
 * token holds a set, as one client process usually does several jobs.
 */
export const API_TOKEN_SCOPES = [
  'catalog-sync',
  'customer-sync',
  'customer-read',
  'order-read',
  'order-sync',
] as const;
export type ApiTokenScope = (typeof API_TOKEN_SCOPES)[number];
