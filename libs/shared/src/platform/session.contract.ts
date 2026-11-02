import * as z from 'zod';
import { storedEmailField } from '../lib/config/contact-config';
import { USER_ROLES } from './session';

export const userRoleSchema = z.enum(USER_ROLES);

/**
 * The authenticated identity exposed to the client. Never carries the password
 * hash, and never a pricing tier — role is authorization only.
 */
export const authUserSchema = z.object({
  id: z.uuid(),
  email: storedEmailField,
  role: userRoleSchema,
  /**
   * Enough to greet the account holder by name, and nothing more — the rest of
   * their record is the account profile's job. Null on accounts nobody
   * registered (the bootstrap admin, staff created before the field existed),
   * so every consumer falls back to the address.
   */
  firstName: z.string().nullable(),
  /**
   * The account still carries a password it did not choose itself — the
   * bootstrap admin's seeded one (FR-AUTH-07). The client uses it to force the
   * change-password prompt.
   */
  mustChangePassword: z.boolean(),
});
export type AuthUser = z.infer<typeof authUserSchema>;
