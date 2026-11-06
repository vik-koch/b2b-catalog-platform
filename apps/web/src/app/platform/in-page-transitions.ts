import { ActivatedRouteSnapshot, ViewTransitionInfo } from '@angular/router';

/** The primary outlet's path, segment by segment from the root. */
export function routePath(root: ActivatedRouteSnapshot): string {
  const parts: string[] = [];
  for (
    let route: ActivatedRouteSnapshot | null = root;
    route;
    route = route.firstChild
  ) {
    parts.push(...route.url.map((segment) => segment.path));
  }
  return parts.join('/');
}

/**
 * Cross-fades only between pages. A change of query or fragment redraws part
 * of the page the visitor is working in, a filter or a sort, and fading the
 * whole page there reads as a flicker under the control they just used.
 */
export function skipInPageTransitions({
  transition,
  from,
  to,
}: ViewTransitionInfo): void {
  if (routePath(from) === routePath(to)) transition.skipTransition();
}
