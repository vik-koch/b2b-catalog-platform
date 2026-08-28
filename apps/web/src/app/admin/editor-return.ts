import { computed, DestroyRef, inject, signal, Signal } from '@angular/core';
import { ActivatedRoute, NavigationEnd, Router } from '@angular/router';

/** Query param carrying the screen an editor was opened from. */
export const EDITOR_RETURN_PARAM = 'from';

/**
 * Where an editor goes when it closes. Most editors are reachable from more than
 * one place — a static page from the admin panel *and* from the page itself, a
 * product from the admin list *and* from the storefront — so "cancel" has to
 * mean "put me back where I was" rather than one hardcoded list.
 *
 * The opener passes its own URL as `?from=`; anything else falls back to the
 * editor's own list. Only in-app absolute paths are honoured, so a hand-edited
 * link cannot turn cancel into a redirect somewhere else.
 */
export function injectEditorReturn(): (fallback: string) => Promise<boolean> {
  const route = inject(ActivatedRoute);
  const router = inject(Router);
  // Read when the editor closes, not when it opens: an editor navigated to
  // from another editor of the same kind is the same component instance with a
  // new `from`, and the one to honour is the one on screen.
  return (fallback: string) => {
    const from = route.snapshot.queryParamMap.get(EDITOR_RETURN_PARAM);
    const safe = from?.startsWith('/') && !from.startsWith('//') ? from : null;
    return router.navigateByUrl(safe ?? fallback);
  };
}

/**
 * The counterpart for an opener: the value to hand an editor link so it can come
 * back here. `router.url` is the current route including its query params, which
 * is exactly what "where I was" means.
 *
 * A signal, and it has to be. Angular reuses a component across navigations
 * that only change its route parameters, so a category grid walking from
 * "Coffee" to "Coffee / Arabica" is one component instance throughout — read
 * once at construction, this would hand every editor opened from the
 * subcategory the *parent's* URL, and closing it would land a step up the tree.
 */
export function injectEditorReturnParams(): Signal<{ from: string }> {
  const router = inject(Router);
  const url = signal(router.url);
  const subscription = router.events.subscribe((event) => {
    if (event instanceof NavigationEnd) url.set(router.url);
  });
  inject(DestroyRef).onDestroy(() => subscription.unsubscribe());
  return computed(() => ({ [EDITOR_RETURN_PARAM]: url() }) as { from: string });
}
