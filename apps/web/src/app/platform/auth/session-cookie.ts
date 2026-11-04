import { AUTH_COOKIE } from '@b2b-catalog-platform/shared/platform';

/** The session's `name=value` pair, the only one passed on to the API. */
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
