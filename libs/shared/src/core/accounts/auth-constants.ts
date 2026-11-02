/**
 * Sign-in values both sides share, kept out of `auth.contract.ts` on purpose.
 *
 * A module that builds a Zod schema cannot be tree-shaken down to its plain
 * constants: `z.string()` is a call, so a bundler has to assume it matters and
 * keeps Zod with it. Importing one cookie name from the contract would
 * therefore put the whole validation runtime in the browser's first load, so
 * everything here is plain data with no imports at all — the schemas that use
 * it live in the contract and import it from here.
 */

/**
 * How often a deployment asks for a code after the password (FR-AUTH-12):
 * never, once to confirm the account's number, or at every sign-in.
 */
export const SIGN_IN_STEP_MODES = ['off', 'once', 'always'] as const;
export type SignInStepMode = (typeof SIGN_IN_STEP_MODES)[number];

/** Digits in a sign-in code: short enough to type off a lock screen. */
export const SIGN_IN_CODE_LENGTH = 6;

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
