import { inject } from '@angular/core';
import { ActivatedRoute, Params, Router } from '@angular/router';

/** A parameter's URL form: omitted when it is the default, so the default
 * view has one URL. */
export function gridParam<T>(value: T, fallback: T): T | null {
  return value === fallback ? null : value;
}

/**
 * Merges parameters into the grid's URL, where its state lives: shareable,
 * reloadable, undone by Back.
 * `page` is cleared: it points at nothing under a new filter. `replaceUrl` is
 * for the search box, one entry per keystroke being no history at all.
 * `scroll: 'manual'`: narrowing a list must not jump to the top.
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
      scroll: 'manual',
    });
  };
}
