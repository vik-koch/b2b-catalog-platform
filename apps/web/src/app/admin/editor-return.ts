import { inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

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
  const from = route.snapshot.queryParamMap.get(EDITOR_RETURN_PARAM);
  const safe = from?.startsWith('/') && !from.startsWith('//') ? from : null;
  return (fallback: string) => router.navigateByUrl(safe ?? fallback);
}

/**
 * The counterpart for an opener: the value to hand an editor link so it can come
 * back here. `router.url` is the current route including its query params, which
 * is exactly what "where I was" means.
 */
export function injectEditorReturnParams(): { from: string } {
  return { [EDITOR_RETURN_PARAM]: inject(Router).url } as { from: string };
}
