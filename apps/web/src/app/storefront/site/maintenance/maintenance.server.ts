import { passesMaintenance } from '@b2b-catalog-platform/shared';
import { requireEnv } from '../../../../env';
import { readSessionHint } from '../../../shared/auth/session-hint';

/**
 * The gate for a cold load: the maintenance screen with a 503 at the requested
 * URL. Mirrors the API's MaintenanceGuard: keep the exemptions in step.
 */

/** Bounds how long a go-live or a lock-down takes to reach visitors. */
const CACHE_TTL_MS = 5000;
let cache: { value: boolean; at: number } | undefined;

/** Fails open: a hiccup must never hide a live shop. */
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

/**
 * The staff way in and the screen itself, as prefixes, so a new page is gated
 * by default and every admin route stays open. The password links stay open
 * for a locked-out staff member; the API refuses a customer's link itself.
 */
const UNGATED_ROOTS = [
  '/login',
  '/forgot-password',
  '/set-password',
  '/admin',
  '/maintenance',
];

/** Whether a request path is public storefront content that maintenance hides. */
export function isGatedPath(path: string): boolean {
  const normalized = path !== '/' ? path.replace(/\/+$/, '') : path;
  // Not a bare prefix test, so `/logins` stays gated.
  return !UNGATED_ROOTS.some(
    (root) => normalized === root || normalized.startsWith(`${root}/`),
  );
}

/**
 * Staff preview the shop rather than the screen. Decided before render without
 * asking the API, so it reads the readable hint, not the session: a forged one
 * buys nothing, as every read the page makes passes the API's own gate.
 */
export function isStaffPreview(cookies: string | undefined): boolean {
  return passesMaintenance(readSessionHint(cookies));
}
