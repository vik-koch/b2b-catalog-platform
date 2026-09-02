import { Component, inject, input, output } from '@angular/core';
import { Params, RouterLink } from '@angular/router';
import { ADMIN_TEXT } from '../../config/admin-text';
import { AdminIcon } from '../../ui/icons/admin-icon';
import { IconButton } from '../../ui/icon-button';

/** What the list knows about a product in order to act on it. */
export interface ProductRowState {
  slug: string;
  name: string;
  publishedAt: string | null;
  deletedAt: string | null;
}

/**
 * What can be done to one product from the list, drawn once for both shapes it
 * appears in — a table cell on a desktop, the foot of a card on a phone.
 *
 * A component rather than a shared `<ng-template>` so the row keeps its type:
 * every one of these buttons switches on publication or deletion, and those two
 * are independent (a restored product does not go back on sale by itself),
 * which is exactly the pair a typo would confuse.
 */
@Component({
  selector: 'app-product-row-actions',
  imports: [RouterLink, AdminIcon, IconButton],
  host: { class: 'flex items-center justify-end gap-2 sm:gap-1' },
  template: `
    <a
      [routerLink]="['/admin/products', product().slug, 'edit']"
      [queryParams]="returnParams()"
      appIconButton
      [attr.aria-label]="editText.editProduct"
      [title]="editText.editProduct"
    >
      <app-admin-icon name="pencil" />
    </a>

    <!-- Publication is independent of deletion, so a deleted row still shows
         where it stands: restoring it does not put it back on the storefront by
         itself. -->
    <button
      type="button"
      appIconButton
      [disabled]="busy()"
      [attr.aria-label]="publishLabel()"
      [title]="publishLabel()"
      (click)="publishToggled.emit(product())"
    >
      <app-admin-icon
        [name]="product().publishedAt ? 'book-dashed' : 'book-check'"
      />
    </button>

    @if (product().deletedAt) {
      <button
        type="button"
        appIconButton
        [attr.aria-label]="common.restore"
        [title]="common.restore"
        (click)="restored.emit(product())"
      >
        <app-admin-icon name="rotate-ccw" />
      </button>
    } @else {
      <button
        type="button"
        appIconButton
        variant="danger"
        [attr.aria-label]="editText.deleteProduct"
        [title]="editText.deleteProduct"
        (click)="deleteRequested.emit(product())"
      >
        <app-admin-icon name="trash-2" />
      </button>
    }
  `,
})
export class ProductRowActions {
  protected readonly common = inject(ADMIN_TEXT).common;
  protected readonly editText = inject(ADMIN_TEXT).editMode;

  readonly product = input.required<ProductRowState>();
  /** So an editor opened from a row returns to this list, filters and all. */
  readonly returnParams = input<Params>({});
  /** While this row's publication is being switched. */
  readonly busy = input(false);

  readonly publishToggled = output<ProductRowState>();
  readonly restored = output<ProductRowState>();
  readonly deleteRequested = output<ProductRowState>();

  /** Names what the button would do, for both the tooltip and screen readers. */
  protected publishLabel(): string {
    return this.product().publishedAt
      ? this.editText.unpublishProduct
      : this.editText.publishProduct;
  }
}
