import { computed, DestroyRef, inject, signal, Signal } from '@angular/core';
import { ActivatedRoute, NavigationEnd, Router } from '@angular/router';

/** The screen an editor was opened from. */
const EDITOR_RETURN_PARAM = 'from';

/** Closes an editor back to `?from=`, its opener, or else to `fallback`. Only
 * an in-app path counts, so a hand-edited link cannot redirect elsewhere. */
export function injectEditorReturn(): (fallback: string) => Promise<boolean> {
  const route = inject(ActivatedRoute);
  const router = inject(Router);
  // Read on closing: the same instance may have been reached with a new `from`.
  return (fallback: string) => {
    const from = route.snapshot.queryParamMap.get(EDITOR_RETURN_PARAM);
    const safe = from?.startsWith('/') && !from.startsWith('//') ? from : null;
    return router.navigateByUrl(safe ?? fallback);
  };
}

/** The opener's side: `router.url`, query included, for an editor link. A
 * signal, as a reused component (a category grid walking into a subcategory)
 * would otherwise hand on the URL it was built at. Not `currentUrl`, whose
 * `Location` reads the root as ''. */
export function injectEditorReturnParams(): Signal<{ from: string }> {
  const router = inject(Router);
  const url = signal(router.url);
  const subscription = router.events.subscribe((event) => {
    if (event instanceof NavigationEnd) url.set(router.url);
  });
  inject(DestroyRef).onDestroy(() => subscription.unsubscribe());
  return computed(() => ({ [EDITOR_RETURN_PARAM]: url() }) as { from: string });
}
