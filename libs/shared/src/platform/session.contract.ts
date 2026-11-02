import * as z from 'zod';
import { storedEmailField } from '../lib/config/contact-config';
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
