import { oc } from '@orpc/contract';
import * as z from 'zod';
import { commonAuthErrors } from './api-error';
import { storedEmailField } from './contact-config';
import { USER_ROLES } from './session';

export const userRoleSchema = z.enum(USER_ROLES);

/** The signed-in identity the client sees: never the hash, never a tier. */
export const authUserSchema = z.object({
  id: z.uuid(),
  email: storedEmailField,
  role: userRoleSchema,
  /** Enough to greet the holder. Null where nobody registered the account
   * (the bootstrap admin), so a reader falls back to the address. */
  firstName: z.string().nullable(),
  /** The password is one it did not choose, the bootstrap admin's seeded
   * one (FR-AUTH-07): the client forces the change-password prompt. */
  mustChangePassword: z.boolean(),
});
export type AuthUser = z.infer<typeof authUserSchema>;

/** The session itself, for every audience: who it is, and ending it. */
export const sessionContract = {
  logout: oc
    .route({
      method: 'POST',
      // Idempotent and open: it only clears the cookie.
      path: '/auth/logout',
      summary: 'Clear the session cookie',
    })
    .output(z.object({ message: z.string() })),

  me: oc
    .route({
      method: 'GET',
      path: '/auth/me',
      summary: 'Return the currently authenticated user',
    })
    .errors(commonAuthErrors)
    .output(authUserSchema),
};
