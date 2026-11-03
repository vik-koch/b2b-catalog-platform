/** The session's values both sides share. Plain data with no imports, so a
 * cookie name does not bring Zod into the first load. */

/** The httpOnly cookie carrying the session JWT. Shared because SSR looks for
 * it by name to tell whether the visitor has a session; it never reads it. */
export const AUTH_COOKIE = 'session';

/**
 * The readable companion to `AUTH_COOKIE`, carrying the role alone, so the
 * browser knows who is signed in before `/auth/me` answers. Written and
 * cleared with the session cookie. A rendering hint, never an authorization:
 * a forged one buys a link to a page that answers 403.
 */
export const SESSION_HINT_COOKIE = 'session_role';

/** Authorization roles, mirroring the `user_role` pg enum. */
export const USER_ROLES = ['admin', 'manager', 'user'] as const;
export type UserRole = (typeof USER_ROLES)[number];
