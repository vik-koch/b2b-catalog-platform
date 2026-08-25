import type { Request, Response } from 'express';
import {
  AUTH_COOKIE,
  SESSION_HINT_COOKIE,
  UserRole,
} from '@b2b-catalog-platform/shared';

// Matches the JWT expiry (7d) so the browser drops the cookie around the time
// the token stops verifying.
export const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * How the session cookie is set, and therefore how it must be cleared — the
 * browser only drops a cookie whose attributes match. Shared, because two
 * places end a session: signing out, and deleting the account behind it.
 *
 * `req.secure` — true behind Traefik's TLS (trust proxy set), false for the
 * plain-HTTP dev/e2e server, so the cookie is usable in both. sameSite lax:
 * sent on top-level navigations (SSR sees it) but not on cross-site POSTs,
 * which blocks CSRF against the mutating endpoints.
 */
export function sessionCookieAttributes(req: Request) {
  return {
    httpOnly: true,
    secure: req.secure,
    sameSite: 'lax' as const,
    path: '/',
  };
}

/** The same cookie, with the lifetime that makes it a session rather than a
 * clearing instruction. */
export function sessionCookie(req: Request) {
  return { ...sessionCookieAttributes(req), maxAge: SESSION_MAX_AGE_MS };
}

/**
 * The readable companion to the session cookie: same attributes, same
 * lifetime, no `httpOnly`. It carries the role and nothing else, so the
 * browser can render the account control correctly before `/auth/me` answers
 * (see `SESSION_HINT_COOKIE`).
 */
function hintCookieAttributes(req: Request) {
  return { ...sessionCookieAttributes(req), httpOnly: false };
}

/**
 * Starts a session on the response: the token, and the hint that says one
 * exists. One function, because a hint written without its cookie — or left
 * behind when the cookie goes — is exactly the disagreement the hint is
 * supposed to make impossible.
 */
export function issueSession(
  req: Request,
  res: Response,
  token: string,
  role: UserRole,
): void {
  res.cookie(AUTH_COOKIE, token, sessionCookie(req));
  res.cookie(SESSION_HINT_COOKIE, role, {
    ...hintCookieAttributes(req),
    maxAge: SESSION_MAX_AGE_MS,
  });
}

/** Ends it, clearing both. The attributes must match what set them or the
 * browser keeps the cookie. */
export function endSession(req: Request, res: Response): void {
  res.clearCookie(AUTH_COOKIE, sessionCookieAttributes(req));
  res.clearCookie(SESSION_HINT_COOKIE, hintCookieAttributes(req));
}
