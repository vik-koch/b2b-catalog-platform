import * as z from 'zod';

/** Idle days where the deployment sets none. */
export const DEFAULT_SESSION_IDLE_DAYS = 7;

/** A session renews while used (FR-AUTH-12). A deployment that asks for a
 * code at sign-in sets it longer, so a regular customer is rarely asked. */
export const sessionConfigSchema = z
  .object({
    idleDays: z.number().int().min(1),
  })
  .strict();
