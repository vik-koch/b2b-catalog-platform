import {
  ActivatedRouteSnapshot,
  BaseRouteReuseStrategy,
} from '@angular/router';

/** `data.noReuse`: another slug is a new activation, which runs canDeactivate
 * and resets the editor, where Angular would reuse it. */
export class StaticPageReuseStrategy extends BaseRouteReuseStrategy {
  override shouldReuseRoute(
    future: ActivatedRouteSnapshot,
    curr: ActivatedRouteSnapshot,
  ): boolean {
    if (
      future.routeConfig === curr.routeConfig &&
      future.routeConfig?.data?.['noReuse']
    ) {
      return future.params['slug'] === curr.params['slug'];
    }
    return super.shouldReuseRoute(future, curr);
  }
}
