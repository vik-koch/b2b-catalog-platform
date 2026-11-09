import { computed, InjectionToken, Signal, signal } from '@angular/core';
import { CanActivateFn } from '@angular/router';

import { AdminText } from './admin-text.type';

/**
 * The admin text is fetched, not injected into the document (server.ts says
 * why): a guard awaits the fetch, and `ADMIN_TEXT` then resolves synchronously
 * like `STOREFRONT_TEXT`. Module-level, as the guard runs outside any
 * component's injector and the text never changes in a tab.
 */
let loaded: AdminText | undefined;
let inFlight: Promise<AdminText> | undefined;

/** For what is mounted before any admin session, such as the edit-mode
 * toggle: the token resolves only after the fetch. */
const loadedSignal = signal<AdminText | null>(null);
export const adminText: Signal<AdminText | null> = loadedSignal.asReadonly();

const adminTextLoaded = computed(() => loadedSignal() !== null);

/** Whether the text has arrived, as a dependency, so a spec decides what "not
 * loaded yet" means rather than the order the runner loaded spec files in. */
export const ADMIN_TEXT_LOADED = new InjectionToken<Signal<boolean>>(
  'ADMIN_TEXT_LOADED',
  { providedIn: 'root', factory: () => adminTextLoaded },
);

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
      // A failed fetch is transient: allow a later attempt.
      inFlight = undefined;
      throw error;
    }));
}

/** Safe because every admin route is behind `adminTextGuard`, and every
 * storefront affordance behind `EditModeService.enabled()`. */
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

/** An area's block of the admin text. Typed apart, but the server checks the
 * file whole against every area's shape, so the block is always there. */
export function adminTextBlock<T>(text: AdminText, area: string): T {
  return (text as unknown as Record<string, T>)[area];
}

/** Holds an admin route until its wording is here, so no label flashes empty. */
export const adminTextGuard: CanActivateFn = async () => {
  await loadAdminText();
  return true;
};
