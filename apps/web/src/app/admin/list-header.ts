import { Component, computed, input } from '@angular/core';
import { NarrowBreakpoint } from '../core/narrow-screen';
import { GridClearFilters } from './grid/grid-clear-filters';
import { GridSearchField } from './grid/grid-search-field';

/**
 * Where the clear-filters glyph stops belonging to the heading: below its
 * grid's own breakpoint the controls row under the table carries it instead,
 * which is the row a phone has for exactly this. Written out rather than
 * interpolated — a class Tailwind's scanner cannot read is a class that is
 * never built.
 */
const CLEAR_AT: Record<NarrowBreakpoint, string> = {
  md: 'hidden md:block',
  lg: 'hidden lg:block',
};

/**
 * The heading row every admin grid wears: title, find-a-row box, actions.
 *
 * Shared because the lists are the same screen with different rows, and a
 * heading that drifts between them makes them look like different tools. The
 * actions are projected — only the caller knows what "add" means here — but the
 * way back to the unfiltered list is not: it belongs to every grid that can be
 * filtered, and reads the same in all of them.
 *
 * Layout: three columns from `md` up in a 1:2:1 ratio, so the search box keeps
 * a usable width for as long as there is room to give it and cannot be pushed
 * off centre by the buttons beside it. Narrower than that, the title keeps the
 * action beside it — the one thing this screen is for is never below the fold —
 * and the search box takes the line under them for itself.
 */
@Component({
  selector: 'app-admin-list-header',
  imports: [GridSearchField, GridClearFilters],
  template: `
    <!-- One grid, reordered rather than re-laid-out: the three parts are the
         same three at both widths, and projected content can only be placed
         once. -->
    <div
      class="mb-4 grid grid-cols-[1fr_auto] items-center gap-4 md:mb-6 md:grid-cols-[1fr_2fr_1fr]"
    >
      <!-- Top-aligned, alone among the three: the row is as tall as whatever
           else is in it — a 38px button here, a search box there, nothing at
           all on a phone — and a centred heading moved by a pixel or two every
           time that changed. -->
      <h1 class="order-1 self-start text-3xl font-medium tracking-tight">
        {{ title() }}
      </h1>

      <div class="order-2 justify-self-end md:order-3">
        <ng-content />
      </div>

      <!-- The way back to the whole list sits with the box the narrowing was
           typed into, not in the row of actions: as a reserved spacer over
           there it pushed "Add customer" a line below the search box. -->
      @if (searchable()) {
        <div
          class="order-3 col-span-2 flex w-full items-center gap-2 md:order-2 md:col-span-1 md:justify-self-center"
        >
          <app-grid-search-field
            class="min-w-0 flex-1"
            [query]="query()"
            [searchLabel]="searchLabel()"
            [searchPlaceholder]="searchPlaceholder()"
            [clearLabel]="clearSearchLabel()"
          />
          <app-grid-clear-filters
            [class]="clearClass()"
            [filtered]="filtered()"
          />
        </div>
      } @else {
        <div class="order-3 hidden md:order-2 md:block"></div>
      }
    </div>
  `,
})
export class AdminListHeader {
  readonly title = input.required<string>();
  /** False for a grid the API cannot search — a box that filters nothing is
   * worse than no box. */
  readonly searchable = input(true);
  readonly query = input('');
  readonly searchLabel = input('');
  readonly searchPlaceholder = input('');
  readonly clearSearchLabel = input('');
  /** Whether anything is narrowing the list, so there is something to clear. */
  readonly filtered = input(false);
  /** Its grid's own breakpoint, so the two never both show the clear control
   * or both hide it. */
  readonly narrowBelow = input<NarrowBreakpoint>('md');

  protected readonly clearClass = computed(() => CLEAR_AT[this.narrowBelow()]);
}
