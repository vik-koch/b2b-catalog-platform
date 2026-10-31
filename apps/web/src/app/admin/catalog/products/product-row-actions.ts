import { Component, computed, inject, input, output } from '@angular/core';
import { Params, RouterLink } from '@angular/router';
import { ADMIN_TEXT } from '../../../shared/config/admin-text';
import { ConfirmService } from '@b2b-catalog-platform/ui/overlay/confirm.service';
import { Icon } from '@b2b-catalog-platform/ui/icons/icon';
import { IconButton } from '@b2b-catalog-platform/ui/actions/icon-button';
import { SettingsService } from '../../settings/settings.service';
import { mayRestore, purgeRefusal } from './product-removal';
import { SHARED_TEXT } from '../../../shared/config/shared-text';
import { bookCheckIcon } from '@b2b-catalog-platform/ui/icons/glyphs/book-check';
import { bookDashedIcon } from '@b2b-catalog-platform/ui/icons/glyphs/book-dashed';
import { pencilIcon } from '@b2b-catalog-platform/ui/icons/glyphs/pencil';
import { rotateCcwIcon } from '@b2b-catalog-platform/ui/icons/glyphs/rotate-ccw';
import { trash2Icon } from '@b2b-catalog-platform/ui/icons/glyphs/trash-2';

/** What the list knows about a product in order to act on it. */
export interface ProductRowState {
  slug: string;
  name: string;
  publishedAt: string | null;
  deletedAt: string | null;
  /** While the catalog is owned, only a run restores it (FR-ADM-10). */
  deletedByRun: boolean;
  /** On some order: never deleted permanently (FR-ADM-21). */
  ordered: boolean;
  /** Null where nothing prices it, which stops publishing (FR-ADM-06). */
  priceMinor: number | null;
}

/**
 * A product's actions in the list, for the table cell and the phone card
 * alike. A component, not an `<ng-template>`, so the row keeps its type: every
 * button switches on publication or deletion, a pair a typo would confuse.
 */
@Component({
  selector: 'app-product-row-actions',
  imports: [RouterLink, Icon, IconButton],
  host: { class: 'flex items-center justify-end gap-2 sm:gap-1' },
  template: `
    <a
      [routerLink]="['/admin/products', product().slug, 'edit']"
      [queryParams]="returnParams()"
      uiIconButton
      [attr.aria-label]="editText.editProduct"
      [title]="editText.editProduct"
    >
      <ui-icon [glyph]="pencilIcon" />
    </a>

    <!-- Three fixed places: edit, a step forward (publish, restore), a step
         back (unpublish, delete). Removal goes in steps (FR-ADM-01), so each
         state offers its neighbours; an empty place keeps its width. -->
    @if (product().deletedAt) {
      <button
        type="button"
        uiIconButton
        [attr.aria-label]="adminText.actions.restore"
        [title]="adminText.actions.restore"
        (click)="onRestoreClick()"
      >
        <ui-icon [glyph]="rotateCcwIcon" />
      </button>
      <!-- Where it would be refused it stays live but muted, and the click
           says why: a disabled button gives no reason on a phone and is
           skipped by the keyboard. -->
      <button
        type="button"
        uiIconButton
        [variant]="purgeRefusal() ? 'default' : 'danger'"
        [attr.aria-label]="editText.purgeProduct"
        [title]="purgeRefusal() ?? editText.purgeProduct"
        (click)="onPurgeClick()"
      >
        <ui-icon [glyph]="trash2Icon" />
      </button>
    } @else if (product().publishedAt) {
      <span uiIconButton class="invisible" aria-hidden="true">
        <ui-icon [glyph]="bookCheckIcon" />
      </span>
      <button
        type="button"
        uiIconButton
        [disabled]="busy()"
        [attr.aria-label]="editText.unpublishProduct"
        [title]="editText.unpublishProduct"
        (click)="publishToggled.emit(product())"
      >
        <ui-icon [glyph]="bookDashedIcon" />
      </button>
    } @else {
      <!-- Live on a product nothing prices: the click explains. -->
      <button
        type="button"
        uiIconButton
        [disabled]="busy()"
        [attr.aria-label]="editText.publishProduct"
        [title]="
          cannotPublish() ? editText.unpricedHint : editText.publishProduct
        "
        (click)="onPublishClick()"
      >
        <ui-icon [glyph]="bookCheckIcon" />
      </button>
      <button
        type="button"
        uiIconButton
        variant="danger"
        [disabled]="busy()"
        [attr.aria-label]="editText.deleteProduct"
        [title]="editText.deleteProduct"
        (click)="deleteRequested.emit(product())"
      >
        <ui-icon [glyph]="trash2Icon" />
      </button>
    }
  `,
})
export class ProductRowActions {
  protected readonly bookCheckIcon = bookCheckIcon;
  protected readonly bookDashedIcon = bookDashedIcon;
  protected readonly pencilIcon = pencilIcon;
  protected readonly rotateCcwIcon = rotateCcwIcon;
  protected readonly trash2Icon = trash2Icon;
  private readonly confirm = inject(ConfirmService);
  private readonly settings = inject(SettingsService);
  protected readonly adminText = inject(ADMIN_TEXT);
  protected readonly editText = inject(ADMIN_TEXT).editMode;
  private readonly ownershipText = inject(ADMIN_TEXT).ownership;
  protected readonly actionText = inject(SHARED_TEXT).actions;

  readonly product = input.required<ProductRowState>();
  /** So an editor opened here returns to this list, filters and all. */
  readonly returnParams = input<Params>({});
  /** While this row's publication is being switched. */
  readonly busy = input(false);

  readonly publishToggled = output<ProductRowState>();
  readonly restored = output<ProductRowState>();
  readonly deleteRequested = output<ProductRowState>();
  readonly purgeRequested = output<ProductRowState>();

  /** An unknown ownership answer reads as owned, for the look of the button
   * only; the click asks for the real answer. */
  protected readonly purgeRefusal = computed(() =>
    this.refusalFor(this.settings.ownedAreas()?.includes('catalog') ?? true),
  );

  private refusalFor(catalogOwned: boolean): string | null {
    return purgeRefusal(
      {
        ordered: this.adminText.catalogErrors['product-ordered'],
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
        closeLabel: this.actionText.close,
      });
      return;
    }
    this.purgeRequested.emit(this.product());
  }

  protected cannotPublish(): boolean {
    return this.product().priceMinor === null;
  }

  protected onPublishClick(): void {
    if (this.cannotPublish()) {
      void this.confirm.tell({
        heading: this.editText.unpricedTitle,
        message: this.adminText.catalogErrors['product-has-no-price'],
        closeLabel: this.actionText.close,
      });
      return;
    }
    this.publishToggled.emit(this.product());
  }

  protected async onRestoreClick(): Promise<void> {
    const allowed = await mayRestore(
      this.confirm,
      this.ownershipText,
      this.actionText.close,
      this.product(),
      async () => (await this.settings.load()).includes('catalog'),
    );
    if (allowed) this.restored.emit(this.product());
  }
}
