/**
 * Auth values both sides share, kept out of `auth.contract.ts` on purpose.
 *
 * A module that builds a Zod schema cannot be tree-shaken down to its plain
 * constants: `z.string()` is a call, so a bundler has to assume it matters and
 * keeps Zod with it. Importing one cookie name from the contract would
 * therefore put the whole validation runtime in the browser's first load, so
 * everything here is plain data with no imports at all — the schemas that use
 * it live in the contract and import it from here.
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

/**
 * Length is the only password rule this contract carries, so the browser can
 * check the same floor the server does. Twelve rather than eight because
 * length is what actually resists guessing; there are deliberately **no**
 * composition rules (a digit, a symbol, a capital), which NIST 800-63B
 * recommends against — they produce predictable passwords like `Passwort1!`
 * without making them harder to guess.
 *
 * What replaces them is server-side and cannot live here: a blocklist of
 * common passwords, and a refusal of anything containing the account's own
 * address or the shop's name (see PasswordPolicy).
 */
export const PASSWORD_MIN_LENGTH = 12;

/**
 * A set-a-password link that is no good. Unknown, already used and expired are
 * deliberately one code, as they are one answer.
 */
export const PASSWORD_TOKEN_INVALID = 'password-token-invalid' as const;
