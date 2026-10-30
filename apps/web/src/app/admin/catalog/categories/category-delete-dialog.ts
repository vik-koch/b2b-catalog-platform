import {
  afterNextRender,
  Component,
  computed,
  ElementRef,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { fillText } from '@b2b-catalog-platform/shared';
import { AdminCategory } from '@b2b-catalog-platform/shared/admin/catalog';

import { ADMIN_TEXT } from '../../../shared/config/admin-text';
import { SettingsService } from '../../settings/settings.service';
import { Button } from '@b2b-catalog-platform/ui/actions/button';
import { DialogActions } from '@b2b-catalog-platform/ui/overlay/dialog-actions';
import { DialogPanel } from '@b2b-catalog-platform/ui/overlay/dialog-panel';
import { Icon } from '@b2b-catalog-platform/ui/icons/icon';
import { FieldLabel } from '@b2b-catalog-platform/ui/fields/field-label';
import { CategoriesService } from './categories.service';
import { CategoryPicker } from './category-picker';
import { categoriesOutside } from './category-tree';
import { SHARED_TEXT } from '../../../shared/config/shared-text';
import { ErrorText } from '@b2b-catalog-platform/ui/fields/error-text';
import { trash2Icon } from '@b2b-catalog-platform/ui/icons/glyphs/trash-2';

/**
 * Every category delete (FR-ADM-01), from the storefront grid as well as the
 * list; the storefront `@defer`s it, which keeps the admin client out of its
 * bundle. It reads the category's counts itself: blocked by subcategories, a
 * destination for its products (deleted ones too, which still hold it), or a
 * plain confirmation. It never navigates.
 */
@Component({
  selector: 'app-category-delete-dialog',
  imports: [
    Button,
    Icon,
    CategoryPicker,
    FieldLabel,
    DialogActions,
    DialogPanel,
    ErrorText,
  ],
  template: `
    <dialog
      #dialog
      (cancel)="cancelled.emit()"
      aria-labelledby="category-delete-heading"
      uiDialogPanel
    >
      <h2
        id="category-delete-heading"
        class="text-xl font-normal tracking-tight"
      >
        {{ text.deleteTitle }}
      </h2>

      @if (mode() === 'loading') {
        <p class="mt-3 text-ink-subtle" role="status">…</p>
      } @else if (mode() === 'blocked-children') {
        <p class="mt-3 text-ink-subtle">{{ blockedChildrenMessage() }}</p>
      } @else if (mode() === 'blocked-owned') {
        <p class="mt-3 text-ink-subtle">{{ ownedMessage() }}</p>
      } @else if (mode() === 'reassign') {
        <p class="mt-3 text-ink-subtle">{{ reassignIntro() }}</p>
        @if (self()?.deletedProductCount; as deleted) {
          <p class="mt-2 text-ink-subtle">{{ reassignDeleted(deleted) }}</p>
        }
        <div class="mt-4">
          <span uiFieldLabel>{{ text.reassignLabel }}</span>
          <app-category-picker
            [categories]="destinations()"
            [value]="reassignTo()"
            [placeholder]="text.reassignPlaceholder"
            [ariaLabel]="text.reassignLabel"
            (valueChange)="reassignTo.set($event)"
          />
        </div>
      } @else {
        <p class="mt-3 text-ink-subtle">{{ confirmMessage() }}</p>
      }

      @if (error()) {
        <p uiErrorText class="mt-4" role="alert">{{ error() }}</p>
      }

      <div uiDialogActions>
        <button
          uiButton
          variant="secondary"
          type="button"
          (click)="cancelled.emit()"
        >
          {{ actionText.cancel }}
        </button>
        @if (
          mode() !== 'loading' &&
          mode() !== 'blocked-children' &&
          mode() !== 'blocked-owned'
        ) {
          <button
            uiButton
            variant="danger"
            type="button"
            class="gap-2"
            [disabled]="deleting() || (mode() === 'reassign' && !reassignTo())"
            (click)="confirm()"
          >
            <ui-icon [glyph]="trash2Icon" class="size-4" />
            {{ deleting() ? actionText.deleting : adminText.actions.delete }}
          </button>
        }
      </div>
    </dialog>
  `,
})
export class CategoryDeleteDialog {
  protected readonly trash2Icon = trash2Icon;
  private readonly service = inject(CategoriesService);
  protected readonly adminText = inject(ADMIN_TEXT);
  protected readonly text = inject(ADMIN_TEXT).categories.list;
  protected readonly ownershipText = inject(ADMIN_TEXT).ownership;
  protected readonly actionText = inject(SHARED_TEXT).actions;

  private readonly dialog =
    viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  readonly slug = input.required<string>();
  readonly name = input.required<string>();
  readonly deleted = output<void>();
  readonly cancelled = output<void>();

  private readonly all = signal<AdminCategory[]>([]);
  protected readonly self = signal<AdminCategory | null>(null);
  private readonly loading = signal(true);
  protected readonly deleting = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly reassignTo = signal('');

  protected readonly mode = computed<
    'loading' | 'blocked-children' | 'blocked-owned' | 'reassign' | 'confirm'
  >(() => {
    if (this.loading()) return 'loading';
    const self = this.self();
    if (!self || self.childCount > 0) return 'blocked-children';
    // Its own products only: one with children never gets here.
    if (heldBy(self) > 0) {
      // Moving products writes the exchange's field; an empty category still
      // deletes while the catalog is owned.
      return this.catalogOwned() ? 'blocked-owned' : 'reassign';
    }
    return 'confirm';
  });

  private readonly ownership = inject(SettingsService);
  private readonly catalogOwned = computed(
    () => this.ownership.ownedAreas()?.includes('catalog') ?? false,
  );

  protected readonly destinations = computed<AdminCategory[]>(() => {
    const self = this.self();
    return self ? categoriesOutside(this.all(), self.id) : [];
  });

  constructor() {
    // Opens once loaded, so the modal appears at its final size.
    afterNextRender(() => void this.open());
  }

  private async open(): Promise<void> {
    const categories = await this.service.list();
    this.all.set(categories);
    this.self.set(categories.find((c) => c.slug === this.slug()) ?? null);
    this.loading.set(false);
    this.dialog().nativeElement.showModal();
  }

  protected confirmMessage(): string {
    return fillText(this.text.deleteConfirm, { name: this.name() });
  }

  protected blockedChildrenMessage(): string {
    return fillText(this.text.deleteBlockedChildren, { name: this.name() });
  }

  protected reassignIntro(): string {
    const self = this.self();
    return fillText(this.text.deleteReassignIntro, {
      name: this.name(),
      count: self ? heldBy(self) : 0,
    });
  }

  protected reassignDeleted(count: number): string {
    return fillText(this.text.deleteReassignDeleted, { count });
  }

  /** Only deleted products left is its own sentence: the general one advises
   * emptying it in the source, which has already happened. */
  protected ownedMessage(): string {
    const self = this.self();
    if (!self || self.directProductCount > 0) {
      return this.ownershipText.categoryHasProducts;
    }
    return fillText(this.ownershipText.categoryHasDeletedProducts, {
      count: self.deletedProductCount,
    });
  }

  protected async confirm(): Promise<void> {
    const self = this.self();
    if (!self) return;
    this.deleting.set(true);
    this.error.set(null);
    try {
      const result = await this.service.remove(
        self.id,
        this.reassignTo() || undefined,
      );
      if (result.ok) return this.deleted.emit();
      // Only a reassign is refused for ownership: it moves products.
      this.error.set(
        result.code === 'catalog-externally-owned'
          ? this.adminText.ownership.fieldLocked
          : this.adminText.catalogErrors[result.code],
      );
    } catch {
      this.error.set(this.text.deleteError);
    }
    this.deleting.set(false);
  }
}

/** Its own products, deleted ones included: what holds a category. */
function heldBy(category: AdminCategory): number {
  return category.directProductCount + category.deletedProductCount;
}
