import { inject } from '@angular/core';
import { ActivatedRoute, Params, Router } from '@angular/router';
import {
  AdminProductSort,
  adminProductSortSchema,
  AdminProductState,
  adminProductStateSchema,
} from '@b2b-catalog-platform/shared';

/**
 * The admin grid's URL state (FR-ADM-05). Filters, the search box and the sort
 * all live in query parameters rather than in component state, for the same
 * reason the storefront listing does it: the view is then shareable, survives a
 * reload, and the back button undoes a filter instead of leaving the page.
 *
 * Defaults are written as *absent* parameters, so the plain `/admin/products`
 * URL is the one form of the default view.
 */

export const DEFAULT_ADMIN_SORT: AdminProductSort = 'relevance';
export const DEFAULT_ADMIN_STATE: AdminProductState = 'all';

/** A hand-edited or stale parameter resolves to the default rather than
 * becoming a request the API would reject. */
export function resolveAdminSort(raw: string): AdminProductSort {
  const parsed = adminProductSortSchema.safeParse(raw);
  return parsed.success ? parsed.data : DEFAULT_ADMIN_SORT;
}

export function resolveAdminState(raw: string): AdminProductState {
  const parsed = adminProductStateSchema.safeParse(raw);
  return parsed.success ? parsed.data : DEFAULT_ADMIN_STATE;
}

/** A parameter's URL form: omitted when it is the default. */
export function gridParam<T>(value: T, fallback: T): T | null {
  return value === fallback ? null : value;
}

/**
 * Merges parameters into the current grid URL — what actually re-fetches, since
 * the page reads its whole query off the route.
 *
 * `page` is always cleared: page 4 of the previous filter, ordering or query
 * points at nothing in particular under the new one. `replaceUrl` is for the
 * search box, where one history entry per keystroke would make the back button
 * useless; a filter or a sort is a deliberate step and keeps its entry.
 */
export function injectGridNav(): (
  params: Params,
  options?: { replaceUrl?: boolean },
) => void {
  const router = inject(Router);
  const route = inject(ActivatedRoute);

  return (params, options = {}) => {
    void router.navigate([], {
      relativeTo: route,
      queryParams: { ...params, page: null },
      queryParamsHandling: 'merge',
      replaceUrl: options.replaceUrl ?? false,
    });
  };
}
