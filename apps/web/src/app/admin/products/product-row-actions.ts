import { Component, inject, input, output } from '@angular/core';
import { Params, RouterLink } from '@angular/router';
import { ADMIN_TEXT } from '../../config/admin-text';
import { ConfirmService } from '../../ui/confirm.service';
import { AdminIcon } from '../../ui/icons/admin-icon';
import { IconButton } from '../../ui/icon-button';

/** What the list knows about a product in order to act on it. */
export interface ProductRowState {
  slug: string;
  name: string;
  publishedAt: string | null;
  deletedAt: string | null;
  /** Null where no price list prices it, which is the one thing that stops it
   * being published (FR-ADM-06). */
  priceMinor: number | null;
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
    <!-- Present and live on a product nothing prices: it explains instead of
         acting, the way the delete dialog explains an externally owned
         catalog. A dead button says only that something is wrong with it. -->
    <button
      type="button"
      appIconButton
      [disabled]="busy()"
      [attr.aria-label]="publishLabel()"
      [title]="cannotPublish() ? editText.unpricedHint : publishLabel()"
      (click)="onPublishClick()"
    >
      <app-admin-icon
        [name]="product().publishedAt ? 'book-dashed' : 'book-check'"
      />
    </button>

    <!-- Kept while an external system owns the catalog, rather than hidden:
         the same rule greys the editor's fields instead of removing them, and a
         control that vanishes teaches nobody why. The click opens the dialog,
         which explains — see ProductDeleteDialog. -->
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
  private readonly confirm = inject(ConfirmService);
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

  /** An unpublished product with no price cannot go on the storefront; one
   * already published can always come off. */
  protected cannotPublish(): boolean {
    const product = this.product();
    return product.publishedAt === null && product.priceMinor === null;
  }

  /** Publishing an unpriced product is refused by the server, so the click
   * says why rather than sending a request that cannot succeed. */
  protected onPublishClick(): void {
    if (this.cannotPublish()) {
      void this.confirm.tell({
        heading: this.editText.unpricedTitle,
        message: this.common.catalogErrors['product-has-no-price'],
        closeLabel: this.common.close,
      });
      return;
    }
    this.publishToggled.emit(this.product());
  }

  /** Names what the button is for. It says "Publish" on a product nothing
   * prices too: that is what the click is aimed at, and the tooltip beside it
   * is where the reason it will not happen is said. */
  protected publishLabel(): string {
    return this.product().publishedAt
      ? this.editText.unpublishProduct
      : this.editText.publishProduct;
  }
}
