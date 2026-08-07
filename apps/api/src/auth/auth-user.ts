import { AuthUser } from '@b2b-catalog-platform/shared';
import { UserRow } from '../users/users.service';

/**
 * The client-facing identity — never the hash, the tokenVersion or the tier.
 *
 * One function because three places build it (login, JwtAuthGuard,
 * OptionalAuthGuard) and they must agree: a field added in two of the three is
 * a field that appears and disappears depending on how the session was read.
 */
export function toAuthUser(user: UserRow): AuthUser {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    firstName: user.firstName,
    mustChangePassword: user.mustChangePassword,
  };
}
