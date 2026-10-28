import { Component, computed, input } from '@angular/core';
import { NarrowBreakpoint } from '../core/narrow-screen';
import { GridClearFilters } from './grid-clear-filters';
import { GridSearchField } from './grid-search-field';
import { PageIntro } from '../content/page-intro';

/** Below the grid's breakpoint the narrow controls carry clear-filters.
 * Written out: Tailwind cannot see an interpolated class. */
const CLEAR_AT: Record<NarrowBreakpoint, string> = {
  sm: 'hidden sm:block',
  md: 'hidden md:block',
  lg: 'hidden lg:block',
};

/**
 * A grid's heading row: title, search box, actions, and clear-filters beside
 * the search. From `md` up three columns at 1:2:1, so the search box keeps its
 * width and its centre; narrower, the title keeps the action beside it and the
 * search takes the line below. Without a search the title takes its column.
 */
@Component({
  selector: 'ui-grid-header',
  imports: [GridSearchField, GridClearFilters, PageIntro],
  template: `
    <!-- One grid, reordered: projected content can be placed only once. -->
    <div
      class="mb-4 grid grid-cols-[1fr_auto] items-center gap-4
             md:grid-cols-[1fr_2fr_1fr]"
    >
      <!-- Top-aligned: the row's height varies, and a centred title moved. -->
      <h1 [class]="titleClass()">
        {{ title() }}
      </h1>

      <div class="order-2 justify-self-end md:order-3">
        <ng-content />
      </div>

      <!-- With the search box it also clears; in the actions it pushed them down. -->
      @if (searchable()) {
        <div
          class="order-3 col-span-2 flex w-full items-center gap-2
                 md:order-2 md:col-span-1 md:justify-self-center"
        >
          <ui-grid-search-field
            class="min-w-0 flex-1"
            [query]="query()"
            [maxLength]="searchMaxLength()"
            [searchLabel]="searchLabel()"
            [searchPlaceholder]="searchPlaceholder()"
            [clearLabel]="clearSearchLabel()"
          />
          <ui-grid-clear-filters
            [class]="clearClass()"
            [filtered]="filtered()"
          />
        </div>
      }
    </div>
    @if (intro(); as intro) {
      <p uiPageIntro class="mb-6 max-w-3xl">{{ intro }}</p>
    }
  `,
})
export class GridHeader {
  readonly title = input.required<string>();
  /** The paragraph under the heading, where the deployment writes one. */
  readonly intro = input<string | undefined>(undefined);
  /** False where the API cannot search: a box that filters nothing misleads. */
  readonly searchable = input(true);
  readonly query = input('');
  readonly searchMaxLength = input<number>();
  readonly searchLabel = input('');
  readonly searchPlaceholder = input('');
  readonly clearSearchLabel = input('');
  /** Whether anything is narrowing the list, so there is something to clear. */
  readonly filtered = input(false);
  /** The grid's breakpoint, so exactly one clear-filters shows. */
  readonly narrowBelow = input<NarrowBreakpoint>('lg');

  protected readonly clearClass = computed(() => CLEAR_AT[this.narrowBelow()]);
  protected readonly titleClass = computed(
    () =>
      'order-1 self-start text-3xl font-medium tracking-tight' +
      (this.searchable() ? '' : ' md:col-span-2'),
  );
}
