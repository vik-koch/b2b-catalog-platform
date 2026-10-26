import { Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { fillText, Pagination } from '@b2b-catalog-platform/shared';
import { SHARED_TEXT } from '../../shared/config/shared-text';
import { Button } from '../../shared/ui/button';

/**
 * Paging for an admin grid — the same nav the three lists each kept their own
 * copy of, which is how one of them ended up building its page links from an
 * absolute path while the others merged.
 *
 * Every link merges the query it is in: the filters, the search and the sort
 * all live there now, and a link carrying `page` alone would page through a
 * different list than the one on screen. The wording is the storefront's, as
 * it was before: the words for "next page" do not differ by audience.
 */
@Component({
  selector: 'app-grid-pagination',
  imports: [RouterLink, Button],
  template: `
    @if (pagination().totalPages > 1) {
      <nav
        class="mt-8 flex items-center justify-center gap-4 text-sm"
        [attr.aria-label]="pageText.status"
      >
        @if (pagination().page > 1) {
          <a
            routerLink="."
            [queryParams]="{ page: pagination().page - 1 }"
            queryParamsHandling="merge"
            appButton
            variant="ghost"
            size="sm"
            >{{ pageText.previous }}</a
          >
        } @else {
          <span class="px-3 py-1.5 text-disabled">{{ pageText.previous }}</span>
        }
        <span class="text-subtle">{{ status() }}</span>
        @if (pagination().page < pagination().totalPages) {
          <a
            routerLink="."
            [queryParams]="{ page: pagination().page + 1 }"
            queryParamsHandling="merge"
            appButton
            variant="ghost"
            size="sm"
            >{{ pageText.next }}</a
          >
        } @else {
          <span class="px-3 py-1.5 text-disabled">{{ pageText.next }}</span>
        }
      </nav>
    }
  `,
})
export class GridPagination {
  protected readonly pageText = inject(SHARED_TEXT).pagination;

  readonly pagination = input.required<Pagination>();

  protected readonly status = computed(() =>
    fillText(this.pageText.status, {
      page: this.pagination().page,
      total: this.pagination().totalPages,
    }),
  );
}
