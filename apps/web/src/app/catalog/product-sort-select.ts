import { Component, computed, inject, input } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import {
  PRODUCT_SORTS,
  ProductSort,
  SEARCH_SORTS,
  SearchSort,
} from '@b2b-catalog-platform/shared';
import { APP_TEXT } from '../config/app-text';
import { DEPLOYMENT_CONFIG } from '../config/deployment-config';
import { Input } from '../ui/input';
import { SelectField } from '../ui/select-field';

/**
 * Ties the visible label to the field. A constant rather than a generated id:
 * a counter would hand the server and the browser different ids for the same
 * element. A listing renders this twice — once above the grid for a window wide
 * enough for the filter column, once inside the filter disclosure below that —
 * and only one of the two is ever on screen, so the second is given an id of
 * its own rather than repeating this one.
 */
const SORT_FIELD_ID = 'product-sort';

/**
 * The sort control for a product listing (FR-SEARCH-04) — shared by the
 * category grid and the search results, so both offer the same vocabulary in
 * the same place.
 *
 * A native `<select>`: one of a handful of mutually exclusive options is
 * exactly what the element is for, and it comes with keyboard support, an
 * accessible name and a usable mobile picker that a custom popup would have to
 * re-earn.
 *
 * The control owns its own navigation rather than emitting upward. Sort lives
 * in the URL (FR-SEARCH-04), and merging one query parameter into the current
 * route is the same operation on both pages — so neither host has to know how
 * the other builds its links.
 *
 * A deployment can switch the control off (FR-SEARCH-04), and it does so here
 * rather than at the three places that draw one: what a deployment turns off
 * is the control, wherever it appears, and a listing added later would
 * otherwise have to remember to ask. Only the control goes — the parameter
 * still orders the listing, so saved and shared links keep working.
 */
@Component({
  selector: 'app-product-sort-select',
  imports: [Input, SelectField],
  template: `
    @if (enabled) {
      <div class="flex items-center gap-2">
        <label
          [attr.for]="id()"
          class="text-sm whitespace-nowrap text-subtle"
          >{{ text.sort.label }}</label
        >
        <app-select-field class="max-w-52">
          <!-- Selection is marked on the option rather than bound on the <select>:
             a value binding is applied before the options exist, and the element
             silently falls back to the first one.

             Attribute and property both, and neither is redundant. A property
             write does not reflect to an attribute in the server's DOM, so the
             property alone renders HTML with nothing selected: the page shows
             the first option until hydration corrects it. The attribute alone
             is only the initial selectedness — once the visitor has picked
             something the element is dirty and ignores it, so a later
             navigation (back/forward) needs the property. -->
          <select
            appInput
            size="sm"
            [id]="id()"
            (change)="onSelect($event)"
            class="w-full"
          >
            @for (option of options(); track option) {
              <option
                [value]="option"
                [selected]="option === value()"
                [attr.selected]="option === value() ? '' : null"
              >
                {{ text.sort[option] }}
              </option>
            }
          </select>
        </app-select-field>
      </div>
    }
  `,
})
export class ProductSortSelect {
  /** Whether this deployment offers the control at all (FR-SEARCH-04). */
  protected readonly enabled =
    inject(DEPLOYMENT_CONFIG).catalog.sortControlsEnabled;
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  protected readonly text = inject(APP_TEXT).catalog;
  /** Overridden by the copy inside the filter panel, so the two instances
   * cannot label each other's field. */
  readonly fieldId = input(SORT_FIELD_ID);
  protected readonly id = this.fieldId;

  /** The sort in effect — already resolved to a valid key by the host. */
  readonly value = input.required<SearchSort>();
  /**
   * Whether relevance is on offer. Only search can rank by it, so the category
   * listing omits it rather than showing an option its endpoint would reject.
   */
  readonly withRelevance = input(false);
  /** The default for this listing, which is left out of the URL. */
  readonly defaultSort = input.required<SearchSort>();

  protected readonly options = computed<readonly SearchSort[]>(() =>
    this.withRelevance() ? SEARCH_SORTS : PRODUCT_SORTS,
  );

  /**
   * Writes the choice to the URL, which is what actually re-fetches — the
   * listing reads its sort from the query parameter, so there is no local state
   * to keep in step. `page` is dropped: a page number from the previous
   * ordering points at nothing in particular in the new one. The default is
   * written as an absent parameter, so the plain URL stays the shareable form
   * of the default view.
   */
  protected onSelect(event: Event): void {
    const sort = (event.target as HTMLSelectElement).value as SearchSort;
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { sort: sortParam(sort, this.defaultSort()), page: null },
      queryParamsHandling: 'merge',
    });
  }
}

/**
 * The `sort` query parameter for a listing, or `null` when it is the default —
 * which the router leaves out entirely. One definition, used both when the
 * control navigates and when a listing builds its pagination links, so the
 * default view has exactly one URL rather than two that render the same page.
 */
export function sortParam(
  sort: SearchSort,
  defaultSort: SearchSort,
): SearchSort | null {
  return sort === defaultSort ? null : sort;
}

/*
 * Narrowing the `sort` query parameter, one function per listing because the
 * two offer different sets and each hands its result to a differently typed
 * endpoint. A hand-edited or stale `?sort=` resolves to the listing's default
 * rather than becoming a request the API would reject.
 */

export function resolveCategorySort(raw: string): ProductSort {
  return PRODUCT_SORTS.includes(raw as ProductSort)
    ? (raw as ProductSort)
    : 'name';
}

export function resolveSearchSort(raw: string): SearchSort {
  return SEARCH_SORTS.includes(raw as SearchSort)
    ? (raw as SearchSort)
    : 'relevance';
}
