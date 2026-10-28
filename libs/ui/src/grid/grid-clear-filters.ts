import { Component, inject, input } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { GRID_TEXT } from './grid-text';
import { ClearFiltersButton } from '../actions/clear-filters-button';

/**
 * Clear-filters for a grid, whose state is its URL. It keeps the sort, which
 * is no filter, and reads it off the route when pressed, so its two places
 * cannot disagree.
 */
@Component({
  selector: 'ui-grid-clear-filters',
  imports: [ClearFiltersButton],
  template: `
    <ui-clear-filters-button
      [label]="gridText.clearFilters"
      [filtered]="filtered()"
      (cleared)="clear()"
    />
  `,
})
export class GridClearFilters {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  protected readonly gridText = inject(GRID_TEXT);

  /** Whether anything narrows the list, the search included. */
  readonly filtered = input(false);

  /** Everything goes but the ordering, which the URL keeps as it was. */
  protected clear(): void {
    const sort = this.route.snapshot.queryParamMap.get('sort');
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: sort ? { sort } : {},
      scroll: 'manual',
    });
  }
}
