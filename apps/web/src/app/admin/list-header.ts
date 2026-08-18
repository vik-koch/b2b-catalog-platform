import { Component, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ADMIN_TEXT } from '../config/admin-text';
import { Button } from '../ui/button';
import { AdminIcon } from '../ui/icons/admin-icon';
import { GridSearchField } from './products/grid-search-field';

/**
 * The heading row every admin grid wears: title, find-a-row box, actions.
 *
 * Shared because the three lists (products, customers, staff) are the same
 * screen with different rows, and a heading that drifts between them makes them
 * look like different tools. The actions are projected — only the caller knows
 * what "add" means here — but the way back to the unfiltered list is not: it
 * belongs to every grid that can be filtered, and reads the same in all of them.
 *
 * Layout: three even columns from `md` up, so the search box sits in the middle
 * of the page and cannot be pushed off it by the buttons beside it. Narrower
 * than that, the three parts stack and align left rather than squeezing — a
 * heading is not worth a horizontal scrollbar.
 */
@Component({
  selector: 'app-admin-list-header',
  imports: [RouterLink, Button, AdminIcon, GridSearchField],
  template: `
    <div class="mb-6 grid gap-4 md:grid-cols-3 md:items-center">
      <h1 class="text-3xl font-bold tracking-tight">{{ title() }}</h1>

      <app-grid-search-field
        class="md:justify-self-center"
        [query]="query()"
        [searchLabel]="searchLabel()"
        [searchPlaceholder]="searchPlaceholder()"
        [clearLabel]="clearSearchLabel()"
      />

      <div
        class="flex flex-wrap items-center gap-2 md:justify-end md:justify-self-end"
      >
        <!-- One way back to the whole list. The filters are spread across the
             heading and the column headers, so undoing them one at a time is a
             hunt — and a save arrives here with the row's name already in the
             search box.

             Hidden rather than absent, so its width is reserved either way:
             adding it to the row when a filter is applied would shove the
             search box sideways, and the box is where the filtering was just
             typed. Hidden visibility also takes it out of hit-testing; the two
             attributes take it out of the tab order and the accessibility
             tree, so it is only there as a spacer. -->
        <a
          appButton
          variant="secondary"
          routerLink="."
          [queryParams]="{}"
          class="gap-2"
          [class.invisible]="!filtered()"
          [attr.aria-hidden]="filtered() ? null : 'true'"
          [attr.tabindex]="filtered() ? null : -1"
        >
          <app-admin-icon name="x" class="h-4 w-4" />
          {{ common.clearFilters }}
        </a>
        <ng-content />
      </div>
    </div>
  `,
})
export class AdminListHeader {
  protected readonly common = inject(ADMIN_TEXT).common;

  readonly title = input.required<string>();
  readonly query = input('');
  readonly searchLabel = input('');
  readonly searchPlaceholder = input('');
  readonly clearSearchLabel = input('');
  /** Whether anything is narrowing the list, so there is something to clear. */
  readonly filtered = input(false);
}
