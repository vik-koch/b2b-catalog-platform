import { Location } from '@angular/common';
import { inject, Signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { filter, map } from 'rxjs';

/**
 * The current URL as a signal, correct from the very first render — for
 * components that live outside the router outlet and so cannot take route
 * inputs.
 *
 * The initial navigation is non-blocking, so on the client the root component
 * (the header, and everything in it) renders once before it completes. At that
 * point `router.url` still says `/` and `ActivatedRoute` reports empty params —
 * it emits its blank initial state synchronously, which is worse than not
 * emitting at all. Anything read from the router there renders wrong for a
 * frame and then corrects itself: a visible flash, and a mismatch against the
 * server, where the same render happened after navigation.
 *
 * `Location` has the answer from the start on both platforms — the browser URL
 * in the client, the request URL under SSR — and `NavigationEnd` takes over
 * once the router is actually moving.
 *
 * Must be called in an injection context.
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
