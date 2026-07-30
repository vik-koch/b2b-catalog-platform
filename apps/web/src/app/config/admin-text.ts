import { computed, InjectionToken, Signal, signal } from '@angular/core';
import { CanActivateFn } from '@angular/router';
import { AdminText } from './admin-text.type';

/**
 * The admin text is fetched, not injected into the document (see the
 * `/admin-text.json` route in server.ts for why). Everything here exists to
 * hide that from the ~20 admin components that just want to read wording:
 * a route guard awaits the fetch, and `ADMIN_TEXT` then resolves synchronously
 * exactly as `APP_TEXT` does.
 *
 * Cached in a module-level variable rather than a service because the guard
 * runs outside any component's injector and the value never changes for the
 * lifetime of the tab.
 */
let loaded: AdminText | undefined;
let inFlight: Promise<AdminText> | undefined;

/**
 * The text once it has arrived, as a signal. Components that are mounted before
 * any admin session exists — the always-present edit-mode toggle — must read it
 * through this rather than injecting ADMIN_TEXT, which is only resolvable after
 * the fetch. Everything behind a guard or the edit-mode gate uses the token.
 */
const loadedSignal = signal<AdminText | null>(null);
export const adminText: Signal<AdminText | null> = loadedSignal.asReadonly();

/** Whether the text has arrived; drives the storefront edit-mode gate. */
export const adminTextLoaded = computed(() => loadedSignal() !== null);

/**
 * Fetches once per tab and shares the promise, so a guard, the edit-mode
 * service and a deferred dialog racing each other still make one request.
 */
export function loadAdminText(): Promise<AdminText> {
  if (loaded) return Promise.resolve(loaded);
  return (inFlight ??= fetch('/admin-text.json')
    .then((response) => {
      if (!response.ok) {
        throw new Error(`Could not load the admin text (${response.status})`);
      }
      return response.json() as Promise<AdminText>;
    })
    .then((text) => {
      loaded = text;
      loadedSignal.set(text);
      return text;
    })
    .catch((error) => {
      // Allow a later attempt: a failed fetch here is a transient network
      // problem, not the permanently-invalid config a missing file would be.
      inFlight = undefined;
      throw error;
    }));
}

/**
 * Synchronous access for admin components. Safe because every route that
 * renders one is behind `adminTextGuard`, and every storefront affordance is
 * behind `EditModeService.enabled()`, which stays false until the text lands.
 */
export const ADMIN_TEXT = new InjectionToken<AdminText>('ADMIN_TEXT', {
  providedIn: 'root',
  factory: () => {
    if (!loaded) {
      throw new Error(
        'ADMIN_TEXT was read before it loaded — the route needs adminTextGuard',
      );
    }
    return loaded;
  },
});

/**
 * Holds an admin route's activation until its wording is available, so the
 * screen renders complete rather than flashing empty labels.
 */
export const adminTextGuard: CanActivateFn = async () => {
  await loadAdminText();
  return true;
};
