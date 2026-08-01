import { requireEnv } from '../../env';

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
