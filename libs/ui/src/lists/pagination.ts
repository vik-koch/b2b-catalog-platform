import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, inject, input, output } from '@angular/core';
import { Params, RouterLink } from '@angular/router';
import { Button } from '../actions/button';
import { ButtonBox } from '../actions/button-box';
import { fill } from '../core/fill';
import { UI_TEXT } from '../core/ui-text';

/**
 * Previous, where we are, next. With a `link` each step is a router link, its
 * query built per page; without one a button that hands the page back. A step
 * past either end stays as words in the button's box, so the row keeps its
 * place. Nothing at all for a single page.
 *
 *   <app-pagination class="mt-8" link="/orders" [page]="p.page"
 *     [totalPages]="p.totalPages" [queryParams]="pageParams" />
 *   <app-pagination [page]="page()" [totalPages]="pages()"
 *     (turned)="page.set($event)" />
 */
@Component({
  selector: 'app-pagination',
  imports: [NgTemplateOutlet, RouterLink, Button, ButtonBox],
  host: { class: 'block empty:hidden' },
  template: `
    @if (totalPages() > 1) {
      <!-- Named by where it stands, so a reader hears the page with it. -->
      <nav
        class="flex items-center justify-center gap-4 text-sm"
        [attr.aria-label]="status()"
      >
        <ng-container
          *ngTemplateOutlet="
            step;
            context: { $implicit: page() - 1, label: text.previous }
          "
        />
        <span class="text-ink-subtle">{{ status() }}</span>
        <ng-container
          *ngTemplateOutlet="
            step;
            context: { $implicit: page() + 1, label: text.next }
          "
        />
      </nav>
    }

    <ng-template #step let-target let-label="label">
      @if (target < 1 || target > totalPages()) {
        <span appButtonBox size="sm" class="text-ink-disabled">{{
          label
        }}</span>
      } @else if (link(); as link) {
        <a
          appButton
          variant="ghost"
          size="sm"
          [routerLink]="link"
          [queryParams]="queryParams()(target)"
          [queryParamsHandling]="merge() ? 'merge' : null"
          >{{ label }}</a
        >
      } @else {
        <button
          type="button"
          appButton
          variant="ghost"
          size="sm"
          (click)="turned.emit(target)"
        >
          {{ label }}
        </button>
      }
    </ng-template>
  `,
})
export class Pagination {
  readonly page = input.required<number>();
  readonly totalPages = input.required<number>();
  readonly link = input<string | readonly unknown[]>();
  readonly queryParams = input<(page: number) => Params>((page) => ({ page }));
  /** Keeps the rest of the query (filters, search, sort) on every step. */
  readonly merge = input(false);

  /** The page asked for, where there is no link. */
  readonly turned = output<number>();

  protected readonly text = inject(UI_TEXT).pagination;

  protected readonly status = computed(() =>
    fill(this.text.status, { page: this.page(), total: this.totalPages() }),
  );
}
