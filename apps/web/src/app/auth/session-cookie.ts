import { AUTH_COOKIE } from '@b2b-catalog-platform/shared';

/**
 * The session cookie out of a `Cookie` header, as `name=value`, or null when
 * the visitor has none. Only this one pair is ever passed on: the rest of the
 * jar (consent, layout preference, the session hint) is the browser's business,
 * not the API's.
 */
export function sessionCookieIn(
  header: string | null | undefined,
): string | null {
  if (!header) return null;
  const prefix = `${AUTH_COOKIE}=`;
  for (const part of header.split(';')) {
    const pair = part.trim();
    if (pair.startsWith(prefix) && pair.length > prefix.length) return pair;
  }
  return null;
}
