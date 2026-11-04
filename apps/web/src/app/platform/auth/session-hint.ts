import { cookieValue } from '../cookie';
import {
  SESSION_HINT_COOKIE,
  USER_ROLES,
  UserRole,
} from '@b2b-catalog-platform/shared/platform';

/** The hint's role, for a right first frame before `/auth/me` answers; an
 * unrecognised value reads as signed out. */
export function readSessionHint(cookies: string | undefined): UserRole | null {
  const value = cookieValue(cookies, SESSION_HINT_COOKIE);
  return (USER_ROLES as readonly string[]).includes(value)
    ? (value as UserRole)
    : null;
}
