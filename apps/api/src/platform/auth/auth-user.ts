import { SessionUser } from './session-users';
import { AuthUser } from '@b2b-catalog-platform/shared/platform';

/** The client-facing identity: never the hash, the tokenVersion or the tier.
 * One function, so sign-in and both guards answer the same fields. */
export function toAuthUser(user: SessionUser): AuthUser {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    firstName: user.firstName,
    mustChangePassword: user.mustChangePassword,
  };
}
