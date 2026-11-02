import type { Request, Response } from 'express';
import {
  AUTH_COOKIE,
  SESSION_HINT_COOKIE,
  UserRole,
} from '@b2b-catalog-platform/shared/platform';

/**
 * How a session cookie is set, and so how it must be cleared: the browser
 * drops only a cookie whose attributes match. `secure` follows the request,
 * true behind the TLS proxy and false on the plain-HTTP dev server. `lax`:
 * sent on top-level navigations, so SSR sees it, but not on cross-site POSTs.
 */
export function sessionCookieAttributes(req: Request) {
  return {
    httpOnly: true,
    secure: req.secure,
    sameSite: 'lax' as const,
    path: '/',
  };
}

/** The session's readable hint: the role only, so the browser renders the
 * account control before `/auth/me` answers. */
function hintCookieAttributes(req: Request) {
  return { ...sessionCookieAttributes(req), httpOnly: false };
}

/** Sets the token and its hint together, so neither outlives the other.
 * `maxAge` is the token's own lifetime. */
export function issueSession(
  req: Request,
  res: Response,
  token: string,
  role: UserRole,
  maxAge: number,
): void {
  res.cookie(AUTH_COOKIE, token, { ...sessionCookieAttributes(req), maxAge });
  res.cookie(SESSION_HINT_COOKIE, role, {
    ...hintCookieAttributes(req),
    maxAge,
  });
}

/** Clears both. */
export function endSession(req: Request, res: Response): void {
  res.clearCookie(AUTH_COOKIE, sessionCookieAttributes(req));
  res.clearCookie(SESSION_HINT_COOKIE, hintCookieAttributes(req));
}
