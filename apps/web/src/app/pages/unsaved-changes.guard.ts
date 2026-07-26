import { inject } from '@angular/core';
import {
  ActivatedRouteSnapshot,
  BaseRouteReuseStrategy,
  CanDeactivateFn,
} from '@angular/router';
import { APP_TEXT } from '../config/app-text';

export interface UnsavedChangesAware {
  hasUnsavedChanges(): boolean;
}

/** Confirms before a navigation drops unsaved edits. */
export const unsavedChangesGuard: CanDeactivateFn<UnsavedChangesAware> = (
  component,
) => {
  if (!component.hasUnsavedChanges()) {
    return true;
  }
  return window.confirm(inject(APP_TEXT).pageEditor.discardConfirm);
};

/**
 * Angular reuses a component across param-only changes, so navigating between
 * two `:slug` pages neither recreates it nor runs canDeactivate. Routes flagged
 * `data.noReuse` opt out: a different slug is treated as a new activation, which
 * fires the guard and resets editor state for free.
 */
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
