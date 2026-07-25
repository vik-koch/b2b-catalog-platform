/**
 * Name of the httpOnly session cookie carrying the signed JWT. The guard reads
 * it; the controller (login/logout) sets and clears it. Kept in one place so
 * the two never drift.
 */
export const AUTH_COOKIE = 'session';
