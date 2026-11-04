import { Location } from '@angular/common';
import { computed, inject, Signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { filter, map } from 'rxjs';

/**
 * The current URL as a signal, right from the first render, for components
 * outside the router outlet. The first navigation does not block, so the root
 * renders once while `router.url` still says `/`; `Location` has the real URL
 * on both platforms until `NavigationEnd` takes over.
 *
 * Call in an injection context.
 */
export function currentUrl(): Signal<string> {
  const router = inject(Router);
  return toSignal(
    router.events.pipe(
      filter((e) => e instanceof NavigationEnd),
      map((e) => e.urlAfterRedirects),
    ),
    { initialValue: inject(Location).path() },
  );
}

/** A URL's path, without its query or fragment. */
export function pathOf(url: string): string {
  return url.split(/[?#]/)[0];
}

/** `currentUrl`'s path. Call in an injection context. */
export function currentPath(): Signal<string> {
  const url = currentUrl();
  return computed(() => pathOf(url()));
}

/** Whether `path` is `route` or below it. */
export function isUnder(path: string, route: string): boolean {
  return path === route || path.startsWith(`${route}/`);
}
