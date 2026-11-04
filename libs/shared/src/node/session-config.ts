import * as z from 'zod';

/** Idle days where the deployment sets none. */
export const DEFAULT_SESSION_IDLE_DAYS = 7;

/**
 * The session (FR-AUTH-12): it renews while used and ends after `idleDays`
 * without use. A deployment that asks for a code at sign-in sets this longer,
 * so a regular customer is rarely asked. Absent means the default.
 */
export const sessionConfigSchema = z
  .object({
    idleDays: z.number().int().min(1),
  })
  .strict();
