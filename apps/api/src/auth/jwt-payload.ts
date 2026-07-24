import { UserRole } from '@b2b-catalog-platform/shared';

/**
 * Claims carried by the signed session token. `sub` is the user id (the JWT
 * standard subject claim). Role is embedded so routine authorization checks
 * need no per-request DB lookup; a role change takes effect on the next login.
 */
export interface JwtPayload {
  sub: string;
  email: string;
  role: UserRole;
}
