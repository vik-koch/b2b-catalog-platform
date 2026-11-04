/**
 * A refusal travels as a `code` from a closed set; the client words it from
 * its own text file. The `message` beside it is for developers and never
 * shown. Renaming a code breaks the contract like renaming a status does.
 */

/** 401 sends the browser to sign-in and 403 to "not for you", so no screen
 * switches on these two. */
export const COMMON_AUTH_ERROR_CODES = [
  'not-authenticated',
  'insufficient-role',
] as const;

export const commonAuthErrors = {
  'not-authenticated': { status: 401 },
  'insufficient-role': { status: 403 },
} as const;

/**
 * A phone number the deployment's rule cannot read (FR-AUTH-12). The browser's
 * field enforces the same rule, so only an API client should meet it.
 */
export const phoneFormatErrors = {
  'phone-format': { status: 400 },
} as const;
