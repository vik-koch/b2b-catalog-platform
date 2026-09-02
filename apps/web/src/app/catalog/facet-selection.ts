import { inject, Injectable } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { encodeAttributeParams, Facet } from '@b2b-catalog-platform/shared';

/** One attribute's ticked values, in the order the facet lists them. */
export function selectedValues(facet: Facet): string[] {
  return facet.values.filter((v) => v.selected).map((v) => v.value);
}

/**
 * Changing the selection, shared by the filter panel and the applied-filter
 * chips — two views of one selection, so the rule for writing it belongs in one
 * place rather than in whichever of them was written first.
 *
 * Provided by each component that uses it, never at the root: it navigates
 * relative to the listing's own route, and the root injector's ActivatedRoute
 * is the empty one — navigating relative to that would drop the path and land
 * on the home page.
 */
@Injectable()
export class FacetSelection {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  /**
   * Rebuilds the whole selection from the facets and applies `change` to one
   * attribute's values. Rebuilt rather than patched into the URL that is there:
   * the facets are the API's reading of that URL, so an entry naming an
   * attribute the catalogue no longer declares drops out the first time
   * anything is clicked instead of riding along forever.
   */
  apply(
    facets: readonly Facet[],
    slug: string,
    change: (values: string[]) => string[],
  ): void {
    const params = encodeAttributeParams(
      facets.map((facet) => ({
        slug: facet.slug,
        values:
          facet.slug === slug
            ? change(selectedValues(facet))
            : selectedValues(facet),
      })),
    );
    this.navigate(params.length ? params : null);
  }

  /** Drops every selection at once (FR-ATTR-06). */
  clearAll(): void {
    this.navigate(null);
  }

  /**
   * Writes the selection to the URL, which is what re-fetches (FR-ATTR-07).
   * `page` is dropped: a page number from the previous selection points at
   * nothing in particular in the new one — the same rule the sort control
   * follows. An empty selection is an absent parameter, so the unfiltered
   * listing keeps exactly one URL.
   *
   * `scroll: 'manual'` opts this one navigation out of the router's scroll to
   * the top: the panel a value is ticked in is halfway down the page on a
   * phone, and ticking a second value from the top of the listing is not what
   * anybody meant to do.
   */
  private navigate(attr: string[] | null): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { attr, page: null },
      queryParamsHandling: 'merge',
      scroll: 'manual',
    });
  }
}
