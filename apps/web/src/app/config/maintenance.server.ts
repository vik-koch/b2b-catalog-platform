import { requireEnv } from '../../env';
import { readSessionHint } from '../auth/session-hint';

/**
 * Server-side maintenance gate (FR-ADM-04, ADR 0023 — the SSR mirror of the
 * API's MaintenanceGuard; the two exemption lists must stay in step). The Node
 * process asks the API whether the storefront is gated and, if so, serves the
 * maintenance screen with a real 503 at the requested URL — no redirect, which
 * an SSR response cannot combine with a 503 anyway.
 *
 * The check is server-authoritative: the client-side gate is only cosmetic and
 * never runs during SSR (see maintenance.guard.ts), so this is the single place
 * that decides what a cold-loading visitor or crawler receives.
 */

// Maintenance flips rarely; a short TTL keeps this off the per-request hot path
// while bounding how long a go-live (or a lock-down) takes to reach visitors.
const CACHE_TTL_MS = 5000;
let cache: { value: boolean; at: number } | undefined;

/** Fails open (false): a hiccup talking to the API must never hide a live shop. */
export async function isMaintenanceOn(): Promise<boolean> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) {
    return cache.value;
  }
  let value = false;
  try {
    const response = await fetch(`${requireEnv('API_URL')}/maintenance`);
    if (response.ok) {
      value =
        ((await response.json()) as { enabled?: unknown }).enabled === true;
    }
  } catch {
    value = false;
  }
  cache = { value, at: Date.now() };
  return value;
}

// The client-rendered, session-scoped route *roots* plus the maintenance screen
// itself. Everything else the Node process server-renders is public storefront
// content and is gated. Keyed off this small closed set rather than re-listing
// every public route, so a new public page is gated by default.
//
// These are prefixes, not exact paths: the admin routes are flat siblings
// (`/admin/products/:slug/edit`, `/admin/sync`, …), and gating them would 503 a
// cold load of an editor during exactly the window they exist for — the admin
// populates catalog and content behind a gated storefront (FR-ADM-01…03).
const UNGATED_ROOTS = [
  '/login',
  '/admin',
  '/account',
  '/change-password',
  '/maintenance',
];

/** Whether a request path is public storefront content that maintenance hides. */
export function isGatedPath(path: string): boolean {
  const normalized = path !== '/' ? path.replace(/\/+$/, '') : path;
  // `startsWith(root + '/')` and not a bare prefix test, so `/logins` — a public
  // path that merely begins with an ungated root — stays gated.
  return !UNGATED_ROOTS.some(
    (root) => normalized === root || normalized.startsWith(`${root}/`),
  );
}

/**
 * Whether this request's readable session hint claims an admin, who previews
 * the live storefront rather than the gate (mirrors the API guard's identity
 * exemption). The httpOnly session cookie says who is really signed in, but the
 * SSR tier never forwards it, so the hint beside it is the only thing the Node
 * process can read — and, like every hint, it is a rendering decision and not
 * an authorization one. A hand-forged value buys nothing: every read the page
 * makes still goes through the API's own gate.
 *
 * Without this an admin's cold load — the first visit, and every F5 after —
 * paints the maintenance screen before the client-side gate lets them through.
 */
export function isAdminPreview(cookies: string | undefined): boolean {
  return readSessionHint(cookies) === 'admin';
}
