import {
  SESSION_HINT_COOKIE,
  USER_ROLES,
  UserRole,
} from '@b2b-catalog-platform/shared';

/**
 * The role from the readable session hint, or null where there is none.
 *
 * This is what lets the browser draw the account control right on the first
 * frame instead of leaning one way until `/auth/me` answers. It is a hint and
 * is treated as one: `AuthService` replaces it with the real identity as soon
 * as the API answers, and every gate that matters is the API's.
 *
 * Anything unrecognised reads as signed out. The cookie is editable by hand,
 * and a value that is not a role is not one.
 */
export function readSessionHint(cookies: string | undefined): UserRole | null {
  const match = cookies?.match(
    new RegExp(`(?:^|;\\s*)${SESSION_HINT_COOKIE}=([^;]*)`),
  );
  const value = match?.[1] ? decodeURIComponent(match[1]) : '';
  return (USER_ROLES as readonly string[]).includes(value)
    ? (value as UserRole)
    : null;
}
