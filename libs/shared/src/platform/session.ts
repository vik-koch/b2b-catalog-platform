/** The session's values both sides share. Import-free, so a cookie name does
 * not bring Zod into the first load. */

/** The httpOnly cookie with the session JWT. SSR checks it exists by name and
 * never reads it. */
export const AUTH_COOKIE = 'session';

/**
 * The readable companion to `AUTH_COOKIE`, carrying the role alone, so the
 * browser knows who is signed in before `/auth/me` answers. A rendering hint,
 * never an authorization: a forged one buys a link to a page that answers 403.
 */
export const SESSION_HINT_COOKIE = 'session_role';

/** Mirrors the `user_role` pg enum. */
export const USER_ROLES = ['admin', 'manager', 'user'] as const;
export type UserRole = (typeof USER_ROLES)[number];
