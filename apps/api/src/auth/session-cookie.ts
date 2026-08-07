import type { Request } from 'express';

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
