import { z } from 'zod';

/**
 * The shape of every refusal this API answers with.
 *
 * `code` is the contract; `message` is not. A client decides what to show from
 * the code alone and reads its wording from its own text file — the server's
 * English is developer-facing, for logs and for anyone reading the API without
 * a browser, and showing it verbatim would put untranslated, unreviewed
 * strings on screen from a place no deployment can edit.
 *
 * So: every declared 4xx carries a code from a closed set, and the browser
 * switches on it. A code is part of the contract like a status is — renaming
 * one is a breaking change; adding one needs the client to have a fallback.
 */
export function apiErrorSchema<const C extends readonly [string, ...string[]]>(
  codes: C,
) {
  return z
    .object({
      code: z.enum(codes),
      /** Developer-facing. Never rendered — see above. */
      message: z.string(),
    })
    .strict();
}

/**
 * The two refusals every guarded endpoint shares. Neither is rendered as a
 * message anywhere: 401 sends the browser to the sign-in form and 403 to the
 * "not for you" screen, so the codes exist to keep the shape uniform rather
 * than because a screen switches on them.
 */
export const COMMON_AUTH_ERROR_CODES = [
  'not-authenticated',
  'insufficient-role',
] as const;
export type CommonAuthErrorCode = (typeof COMMON_AUTH_ERROR_CODES)[number];
export const commonAuthErrorSchema = apiErrorSchema(COMMON_AUTH_ERROR_CODES);
