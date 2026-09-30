import { Component, computed, inject, input } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import {
  CATALOG_SORTS,
  CatalogSort,
  ListingSort,
  PRODUCT_SORTS,
  SEARCH_SORTS,
  SearchSort,
} from '@b2b-catalog-platform/shared';
import { APP_TEXT } from '../config/app-text';
import { DEPLOYMENT_CONFIG } from '../config/deployment-config';
import { Input } from '../ui/input';
import { SEGMENTED_GROUP_NEUTRAL, segmentClass } from '../ui/segmented';
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
 * Two shapes. Above a listing it is a row of segments, one per thing to sort
 * by, where the ordered ones carry their direction as an arrow and pressing
 * the chosen one again turns it round: every order is in view, and there is
 * room for them once the listing is wide enough. Below that width, and inside
 * the filter disclosure, it is a native `<select>`: one of a handful of
 * mutually exclusive options is exactly what the element is for, and it comes
 * with keyboard support, an accessible name and a usable mobile picker that a
 * custom popup would have to re-earn.
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
      @if (shape() === 'segments') {
        <!-- The segments where the listing has room for them; the select
             below that, on the same figure the layout toggle hides at. -->
        <div
          role="group"
          [attr.aria-label]="text.sort.label"
          class="hidden items-center gap-2 @min-[38rem]/listing:flex"
        >
          <span
            class="text-sm whitespace-nowrap text-subtle"
            aria-hidden="true"
          >
            {{ text.sort.label }}
          </span>
          <div [class]="group">
            @for (field of fields(); track field.key) {
              <button
                type="button"
                [class]="segment(field.active)"
                [attr.aria-pressed]="field.active"
                [attr.aria-label]="text.sort[field.shows]"
                [title]="text.sort[field.shows]"
                (click)="press(field.key)"
              >
                {{ text.sort.fields[field.key] }}
                @if (field.arrow) {
                  <span
                    aria-hidden="true"
                    [class]="field.active ? '' : 'text-stone-400'"
                    >{{ field.arrow }}</span
                  >
                }
              </button>
            }
          </div>
        </div>
      }
      <div [class]="selectRow()">
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
  readonly value = input.required<ListingSort>();
  /**
   * What this listing's endpoint accepts: relevance only where there is a
   * query to rank by, by category only on the whole catalogue.
   */
  readonly options = input<readonly ListingSort[]>(PRODUCT_SORTS);
  /** The default for this listing, which is left out of the URL. */
  readonly defaultSort = input.required<ListingSort>();
  /** Segments above a listing, the select inside the filter disclosure. */
  readonly shape = input<'segments' | 'select'>('select');

  protected readonly group = `${SEGMENTED_GROUP_NEUTRAL} h-8 items-center`;
  protected readonly selectRow = computed(
    () =>
      `flex items-center gap-2${this.shape() === 'segments' ? ' @min-[38rem]/listing:hidden' : ''}`,
  );

  /**
   * One segment per thing to sort by. A field offered both ways is one
   * segment with an arrow for its direction — ascending until it is chosen
   * and turned round — and `shows` is the order the segment stands for, whose
   * full wording is its accessible name.
   */
  protected readonly fields = computed(() => {
    const options = this.options();
    const value = this.value();
    const seen = new Set<SortField>();
    return options.flatMap((option) => {
      const key = sortField(option);
      if (seen.has(key)) return [];
      seen.add(key);
      const turns = options.includes(`${key}_desc` as ListingSort);
      const active = sortField(value) === key;
      const shows: ListingSort = active ? value : (key as ListingSort);
      const arrow = turns ? (shows.endsWith('_desc') ? '↓' : '↑') : '';
      return [{ key, active, shows, arrow }];
    });
  });

  protected segment(active: boolean): string {
    return `${segmentClass(active ? 'selected' : 'available', { tone: 'neutral' })} flex h-full items-center gap-1 px-2.5 whitespace-nowrap`;
  }

  /** A new field starts ascending; the chosen one turns round. */
  protected press(key: SortField): void {
    const current = this.value();
    const turns = this.options().includes(`${key}_desc` as ListingSort);
    if (sortField(current) !== key) {
      this.navigate(key as ListingSort);
    } else if (turns) {
      this.navigate(
        (current.endsWith('_desc') ? key : `${key}_desc`) as ListingSort,
      );
    }
  }

  /**
   * Writes the choice to the URL, which is what actually re-fetches — the
   * listing reads its sort from the query parameter, so there is no local state
   * to keep in step. `page` is dropped: a page number from the previous
   * ordering points at nothing in particular in the new one. The default is
   * written as an absent parameter, so the plain URL stays the shareable form
   * of the default view.
   */
  protected onSelect(event: Event): void {
    this.navigate((event.target as HTMLSelectElement).value as ListingSort);
  }

  private navigate(sort: ListingSort): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { sort: sortParam(sort, this.defaultSort()), page: null },
      queryParamsHandling: 'merge',
    });
  }
}

/** What a sort orders by, whichever way round. */
type SortField = 'relevance' | 'category' | 'name' | 'price';

function sortField(sort: ListingSort): SortField {
  return sort.replace(/_desc$/, '') as SortField;
}

/**
 * The `sort` query parameter for a listing, or `null` when it is the default —
 * which the router leaves out entirely. One definition, used both when the
 * control navigates and when a listing builds its pagination links, so the
 * default view has exactly one URL rather than two that render the same page.
 */
export function sortParam(
  sort: ListingSort,
  defaultSort: ListingSort,
): ListingSort | null {
  return sort === defaultSort ? null : sort;
}

/*
 * Narrowing the `sort` query parameter, one function per listing because the
 * two offer different sets and each hands its result to a differently typed
 * endpoint. A hand-edited or stale `?sort=` resolves to the listing's default
 * rather than becoming a request the API would reject.
 */

export function resolveCatalogSort(raw: string): CatalogSort {
  return CATALOG_SORTS.includes(raw as CatalogSort)
    ? (raw as CatalogSort)
    : 'category';
}

export function resolveSearchSort(raw: string): SearchSort {
  return SEARCH_SORTS.includes(raw as SearchSort)
    ? (raw as SearchSort)
    : 'relevance';
}
