import { inject, Injectable } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { encodeAttributeParams } from '@b2b-catalog-platform/shared/core/catalog';
import { Facet } from '@b2b-catalog-platform/shared/storefront/catalog';

/** One attribute's ticked values, in the order the facet lists them. */
export function selectedValues(facet: Facet): string[] {
  return facet.values.filter((v) => v.selected).map((v) => v.value);
}

/** Writes the selection for the filter panel and the applied chips alike.
 * Provided per component, never at the root: the root's ActivatedRoute is the
 * empty one, and navigating relative to it lands on the home page. */
@Injectable()
export class FacetSelection {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  /** Rebuilt from the facets, the API's reading of the URL, rather than
   * patched into it: an attribute the catalogue no longer declares drops out
   * on the first click. */
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

  /** The URL is what re-fetches (FR-ATTR-07); `page` is dropped, as the sort
   * does. No scroll to the top: on a phone the panel is halfway down the page,
   * where the next value is ticked. */
  private navigate(attr: string[] | null): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { attr, page: null },
      queryParamsHandling: 'merge',
      scroll: 'manual',
    });
  }
}
