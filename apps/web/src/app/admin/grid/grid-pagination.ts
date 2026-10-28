import { Component, inject, input } from '@angular/core';
import { type Pagination as Page } from '@b2b-catalog-platform/shared';
import { SHARED_TEXT } from '../../shared/config/shared-text';
import { Pagination } from '../../shared/ui/pagination';

/**
 * Paging for an admin grid. Every step keeps the query it is in: the filters,
 * the search and the sort all live there, and a link carrying `page` alone
 * would page through a different list than the one on screen.
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
      [text]="text"
    />
  `,
})
export class GridPagination {
  protected readonly text = inject(SHARED_TEXT).pagination;

  readonly pagination = input.required<Page>();
}
