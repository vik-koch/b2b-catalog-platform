import { NgTemplateOutlet } from '@angular/common';
import { Component, input } from '@angular/core';
import { Params } from '@angular/router';
import { ProductListItem } from '@b2b-catalog-platform/shared/core/catalog';
import { Pagination } from '@b2b-catalog-platform/ui/lists/pagination';
import { useTaxStatement } from '../../../core/catalog/pricing/tax-statement';
import { EditActions } from '../../../shared/edit-mode/edit-actions';
import { PRODUCT_ROWS, ProductRow } from './product-row';
import { anyStatus } from './product-status-line';
import { PRODUCT_GRID, ProductTile } from './product-tile';

/**
 * A page of products as cards or lines, under a row with their count and the
 * projected controls that arrange them, above the pagination. The category
 * listing and the search results alike.
 *
 *   <app-product-listing [items]="…" [cards]="…" [countLabel]="…" …>
 *     <app-product-sort-select … /> <app-product-layout-toggle />
 *   </app-product-listing>
 */
@Component({
  selector: 'app-product-listing',
  imports: [EditActions, NgTemplateOutlet, Pagination, ProductRow, ProductTile],
  host: { class: 'block' },
  template: `
    <!-- The filter heading's height, so the first card starts on the first
         facet's line. -->
    <div class="mb-4 flex h-8 items-center justify-between gap-4">
      <p class="text-sm text-ink-subtle">{{ countLabel() }}</p>
      <div class="flex items-center gap-3">
        <ng-content />
      </div>
    </div>
    <!-- Faded while the next page, sort or filter loads. -->
    <ul [class]="cards() ? grid : rows" [class.listing-held]="loading()">
      <!-- One cluster for a card's corner and a line's photo. -->
      <ng-template #productEdit let-slug>
        @if (editText(); as editText) {
          <app-edit-actions
            variant="tile"
            [editLink]="['/admin/products', slug, 'edit']"
            [editParams]="editorFrom()"
            [editLabel]="editText.editProduct"
          />
        }
      </ng-template>
      <!-- One product stating a stock reserves the line for all, so the names
           sit level. -->
      @let reserveStatus = anyStatus(items());

      @for (item of items(); track item.slug) {
        <li [class]="cards() ? 'h-full' : ''">
          @if (cards()) {
            <app-product-tile [item]="item" [reserveStatus]="reserveStatus">
              <ng-container
                [ngTemplateOutlet]="productEdit"
                [ngTemplateOutletContext]="{ $implicit: item.slug }"
              />
            </app-product-tile>
          } @else {
            <app-product-row [item]="item">
              <ng-container
                ngProjectAs="[rowOverlay]"
                [ngTemplateOutlet]="productEdit"
                [ngTemplateOutletContext]="{ $implicit: item.slug }"
              />
            </app-product-row>
          }
        </li>
      }
    </ul>
    <!-- NFR-LEGAL-11: once per page, naming no rate. -->
    @if (taxNote) {
      <p class="mt-4 text-xs text-ink-subtle">{{ taxNote }}</p>
    }

    <ui-pagination
      class="mt-8"
      [link]="link()"
      [page]="page()"
      [totalPages]="totalPages()"
      [queryParams]="pageParams()"
    />
  `,
})
export class ProductListing {
  protected readonly grid = PRODUCT_GRID;
  protected readonly rows = PRODUCT_ROWS;
  protected readonly anyStatus = anyStatus;
  protected readonly taxNote = useTaxStatement().listing();

  readonly items = input.required<readonly ProductListItem[]>();
  /** Cards, or full-width lines: the visitor's standing choice. */
  readonly cards = input.required<boolean>();
  readonly loading = input(false);
  readonly countLabel = input.required<string>();
  readonly link = input.required<string | readonly unknown[]>();
  readonly page = input.required<number>();
  readonly totalPages = input.required<number>();
  readonly pageParams = input.required<(page: number) => Params>();
  /** Edit mode's words, or null for a visitor. */
  readonly editText = input<{ editProduct: string } | null>(null);
  readonly editorFrom = input<Params>();
}
