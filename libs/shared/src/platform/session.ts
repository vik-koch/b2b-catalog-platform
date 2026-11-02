/**
 * The session's values both sides share, kept out of `session.contract.ts`
 * on purpose: a module that builds a Zod schema keeps Zod with it in the
 * browser's first load, so everything here is plain data with no imports.
 */

/**
 * Name of the httpOnly cookie carrying the session JWT. Shared because it is
 * not only the API's business: the SSR tier looks for it by name to tell
 * whether the visitor it is rendering for has a session at all (it never reads
 * the value — it cannot, and does not need to).
 */
export const AUTH_COOKIE = 'session';

/**
 * Name of the readable companion to `AUTH_COOKIE`, carrying the signed-in
 * role and nothing else.
 *
 * It exists so the *browser* can answer "is anyone signed in, and as what?"
 * before `/auth/me` does — the session cookie is httpOnly and unreadable by
 * page script, which is what left the navbar's account control guessing on
 * every cold load. It is written and cleared in the same responses as the
 * session cookie, with the same attributes and lifetime, so the two can only
 * disagree when a live session is invalidated server-side.
 *
 * It is a **rendering hint, never an authorization**. Anyone can edit it; the
 * API verifies the JWT and the database role on every request, and the worst a
 * forged value buys is a navbar link to a page that answers 403.
 */
export const SESSION_HINT_COOKIE = 'session_role';

/**
 * Authorization roles.
 * Kept in sync with the `user_role` pg enum in the API schema.
 */
export const USER_ROLES = ['admin', 'manager', 'user'] as const;
export type UserRole = (typeof USER_ROLES)[number];
