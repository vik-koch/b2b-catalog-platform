// Namespace import, not `{ z }`: the named form defeats tree shaking and
// pulls zod's 63 locale files into the bundle (colinhacks/zod#6050).
import * as z from 'zod';

/** How long a session lasts without use where the deployment says nothing:
 * the week a session ran before it slid. */
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
export type SessionConfig = z.infer<typeof sessionConfigSchema>;
