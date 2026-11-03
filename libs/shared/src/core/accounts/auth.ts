/**
 * Sign-in values both sides share: the step, the password's bounds and the
 * refusals a sign-in meets. Plain data with no imports, so a form that needs
 * one of them does not pull the auth schemas, and Zod, with it.
 */

/**
 * How often a deployment asks for a code after the password (FR-AUTH-12):
 * never, once to confirm the account's number, or at every sign-in.
 */
export const SIGN_IN_STEP_MODES = ['off', 'once', 'always'] as const;

/** Digits in a sign-in code: short enough to type off a lock screen. */
export const SIGN_IN_CODE_LENGTH = 6;

/** Why the server refused a password, one code per rule in PasswordPolicy so
 * the form can say which. Length is absent: the form checks it first. */
export const PASSWORD_REJECTION_CODES = [
  'password-common',
  'password-predictable',
  'password-contains-email',
  'password-contains-shop-name',
  /** Only reachable from a password *change*, which knows the old one. */
  'password-unchanged',
] as const;
export type PasswordRejectionCode = (typeof PASSWORD_REJECTION_CODES)[number];

/** The refusal a customer's sign-in meets while maintenance mode is on. */
export const MAINTENANCE_REFUSED = 'maintenance' as const;

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

/** A ceiling against absurd input, not a rule anyone is meant to meet. */
export const PASSWORD_MAX_LENGTH = 200;

/**
 * A set-a-password link that is no good. Unknown, already used and expired are
 * deliberately one code, as they are one answer.
 */
export const PASSWORD_TOKEN_INVALID = 'password-token-invalid' as const;
