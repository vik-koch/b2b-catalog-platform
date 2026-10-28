import { Component, input } from '@angular/core';
import { Pagination } from '../pagination';

/** Where a paged list stands. */
export interface GridPage {
  readonly page: number;
  readonly totalPages: number;
}

/**
 * Paging for a grid. Every step keeps the query: the filters, search and sort
 * live there, and `page` alone would page through a different list.
 */
@Component({
  selector: 'app-grid-pagination',
  imports: [Pagination],
  template: `
    <app-pagination
      class="mt-8"
      link="."
      [merge]="true"
      [page]="pagination().page"
      [totalPages]="pagination().totalPages"
    />
  `,
})
export class GridPagination {
  readonly pagination = input.required<GridPage>();
}
