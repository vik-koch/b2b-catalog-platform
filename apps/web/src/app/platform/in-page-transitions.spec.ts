import { ActivatedRouteSnapshot, ViewTransitionInfo } from '@angular/router';

import { routePath, skipInPageTransitions } from './in-page-transitions';

/** Only what routePath reads: the segments and the first child. */
function snapshot(...levels: string[][]): ActivatedRouteSnapshot {
  return levels.reduceRight<ActivatedRouteSnapshot | null>(
    (child, paths) =>
      ({
        url: paths.map((path) => ({ path })),
        firstChild: child,
      }) as unknown as ActivatedRouteSnapshot,
    null,
  ) as ActivatedRouteSnapshot;
}

function transitionBetween(
  from: ActivatedRouteSnapshot,
  to: ActivatedRouteSnapshot,
) {
  const skipTransition = vi.fn();
  skipInPageTransitions({
    transition: { skipTransition } as unknown as ViewTransition,
    from,
    to,
  } as ViewTransitionInfo);
  return skipTransition;
}

describe('skipInPageTransitions', () => {
  it('reads the path down the primary outlet', () => {
    expect(routePath(snapshot([], ['admin'], ['products']))).toBe(
      'admin/products',
    );
  });

  it('skips a change within one page: a filter, a sort, a page', () => {
    const page = snapshot([], ['admin', 'products']);
    expect(
      transitionBetween(page, snapshot([], ['admin', 'products'])),
    ).toHaveBeenCalled();
  });

  it('keeps the cross-fade between pages', () => {
    expect(
      transitionBetween(
        snapshot([], ['admin', 'products']),
        snapshot([], ['admin', 'orders']),
      ),
    ).not.toHaveBeenCalled();
  });
});
