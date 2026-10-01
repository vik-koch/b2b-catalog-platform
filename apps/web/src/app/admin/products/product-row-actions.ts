import { Component, computed, inject, input, output } from '@angular/core';
import { Params, RouterLink } from '@angular/router';
import { ADMIN_TEXT } from '../../config/admin-text';
import { ConfirmService } from '../../ui/confirm.service';
import { AdminIcon } from '../../ui/icons/admin-icon';
import { IconButton } from '../../ui/icon-button';
import { SettingsService } from '../settings/settings.service';
import { mayRestore, purgeRefusal } from './product-removal';

/** What the list knows about a product in order to act on it. */
export interface ProductRowState {
  slug: string;
  name: string;
  publishedAt: string | null;
  deletedAt: string | null;
  /** Deleted by a sync run: while the catalog is owned, only a run restores
   * it (FR-ADM-10). */
  deletedByRun: boolean;
  /** On some order: never deleted permanently (FR-ADM-21). */
  ordered: boolean;
  /** Null where no price list prices it, which is the one thing that stops it
   * being published (FR-ADM-06). */
  priceMinor: number | null;
}

/**
 * What can be done to one product from the list, drawn once for both shapes it
 * appears in — a table cell on a desktop, the foot of a card on a phone.
 *
 * A component rather than a shared `<ng-template>` so the row keeps its type:
 * every one of these buttons switches on publication or deletion, which is
 * exactly the pair a typo would confuse.
 *
 * Removal goes in steps (FR-ADM-01): unpublish, then delete. A deleted row
 * offers only restore — it is shown as deleted and nothing else, and it is
 * published again only once it is back.
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

    <!-- Three fixed places, so a column of rows reads as one grid: edit,
         then the step that brings a product forward (publish, restore), then
         the step that takes it back (unpublish, delete). Removal goes in
         steps (FR-ADM-01), so each state offers only its neighbours; a place
         a state has nothing for keeps its width. -->
    @if (product().deletedAt) {
      <!-- Kept on a product a run deleted while the catalog is owned, rather
           than hidden: the click says that only the run brings it back. -->
      <button
        type="button"
        appIconButton
        [attr.aria-label]="common.restore"
        [title]="common.restore"
        (click)="onRestoreClick()"
      >
        <app-admin-icon name="rotate-ccw" />
      </button>
      <!-- On every deleted row, since the deleted state offers this step.
           Where this product cannot take it — somebody ordered it, or the
           source still sends it while the catalog is owned (FR-ADM-21) — it
           stays live, muted rather than red, and the click says why, as an
           unpriced product's publish button does. A disabled button would
           give no reason on a phone and be skipped by the keyboard. -->
      <button
        type="button"
        appIconButton
        [variant]="purgeRefusal() ? 'default' : 'danger'"
        [attr.aria-label]="editText.purgeProduct"
        [title]="purgeRefusal() ?? editText.purgeProduct"
        (click)="onPurgeClick()"
      >
        <app-admin-icon name="trash-2" />
      </button>
    } @else if (product().publishedAt) {
      <span appIconButton class="invisible" aria-hidden="true">
        <app-admin-icon name="book-check" />
      </span>
      <button
        type="button"
        appIconButton
        [disabled]="busy()"
        [attr.aria-label]="editText.unpublishProduct"
        [title]="editText.unpublishProduct"
        (click)="publishToggled.emit(product())"
      >
        <app-admin-icon name="book-dashed" />
      </button>
    } @else {
      <!-- Present and live on a product nothing prices: it explains instead of
           acting. A dead button says only that something is wrong with it. -->
      <button
        type="button"
        appIconButton
        [disabled]="busy()"
        [attr.aria-label]="editText.publishProduct"
        [title]="
          cannotPublish() ? editText.unpricedHint : editText.publishProduct
        "
        (click)="onPublishClick()"
      >
        <app-admin-icon name="book-check" />
      </button>
      <button
        type="button"
        appIconButton
        variant="danger"
        [disabled]="busy()"
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
  private readonly settings = inject(SettingsService);
  protected readonly common = inject(ADMIN_TEXT).common;
  protected readonly editText = inject(ADMIN_TEXT).editMode;
  private readonly ownershipText = inject(ADMIN_TEXT).ownership;

  readonly product = input.required<ProductRowState>();
  /** So an editor opened from a row returns to this list, filters and all. */
  readonly returnParams = input<Params>({});
  /** While this row's publication is being switched. */
  readonly busy = input(false);

  readonly publishToggled = output<ProductRowState>();
  readonly restored = output<ProductRowState>();
  readonly deleteRequested = output<ProductRowState>();
  readonly purgeRequested = output<ProductRowState>();

  /**
   * Why deleting permanently would be refused, or null where it can succeed.
   * An unknown ownership answer reads as owned, as the editors read it, for
   * the look of the button only; the click asks for the real answer.
   */
  protected readonly purgeRefusal = computed(() =>
    this.refusalFor(this.settings.ownedAreas()?.includes('catalog') ?? true),
  );

  private refusalFor(catalogOwned: boolean): string | null {
    return purgeRefusal(
      {
        ordered: this.common.catalogErrors['product-ordered'],
        owned: this.ownershipText.productPurge,
      },
      this.product(),
      catalogOwned,
    );
  }

  protected async onPurgeClick(): Promise<void> {
    const owned = (await this.settings.load()).includes('catalog');
    const refusal = this.refusalFor(owned);
    if (refusal) {
      await this.confirm.tell({
        heading: this.editText.purgeProduct,
        message: refusal,
        closeLabel: this.common.close,
      });
      return;
    }
    this.purgeRequested.emit(this.product());
  }

  /** An unpublished product with no price cannot go on the storefront. */
  protected cannotPublish(): boolean {
    return this.product().priceMinor === null;
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

  protected async onRestoreClick(): Promise<void> {
    const allowed = await mayRestore(
      this.confirm,
      this.ownershipText,
      this.common.close,
      this.product(),
      async () => (await this.settings.load()).includes('catalog'),
    );
    if (allowed) this.restored.emit(this.product());
  }
}
