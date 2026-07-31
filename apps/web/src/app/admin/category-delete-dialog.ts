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
import { AdminCategory } from '@b2b-catalog-platform/shared';
import { ADMIN_TEXT } from '../config/admin-text';
import { Button } from '../ui/button';
import { DialogPanel } from '../ui/dialog-panel';
import { LucideIcon } from '../ui/icons/lucide-icon';
import { FieldLabel } from '../ui/field-label';
import { AdminCatalogService } from './admin-catalog.service';
import { CategoryPicker } from './category-picker';
import { categoryDescendantIds } from './category-tree';

/**
 * Delete-a-category confirmation modal (FR-ADM-01), the single flow for every
 * category delete (storefront grid + admin list). It owns `AdminCatalogService`
 * — on the storefront it is `@defer`-loaded so the admin write client stays out
 * of the public bundle — and figures out for itself what the delete needs:
 * loads the categories to read this one's counts, then shows
 *  - a hard block if it has subcategories (resolve the subtree first),
 *  - a destination picker to move its products (incl. soft-deleted) if it has
 *    any (the reassign-then-delete flow), or
 *  - a plain confirm when it is empty.
 * A native `<dialog>` in modal mode (as `ProductDeleteDialog`). Emits `deleted`
 * or `cancelled`; it never navigates itself.
 */
@Component({
  selector: 'app-category-delete-dialog',
  imports: [Button, LucideIcon, CategoryPicker, FieldLabel, DialogPanel],
  template: `
    <dialog
      #dialog
      (cancel)="cancelled.emit()"
      aria-labelledby="category-delete-heading"
      appDialogPanel
    >
      <h2 id="category-delete-heading" class="text-xl font-bold tracking-tight">
        {{ text.deleteTitle }}
      </h2>

      @if (mode() === 'loading') {
        <p class="mt-3 text-stone-500" role="status">…</p>
      } @else if (mode() === 'blocked-children') {
        <p class="mt-3 text-stone-600">{{ blockedChildrenMessage() }}</p>
      } @else if (mode() === 'reassign') {
        <p class="mt-3 text-stone-600">{{ reassignIntro() }}</p>
        <div class="mt-4">
          <span appFieldLabel>{{ text.reassignLabel }}</span>
          <app-category-picker
            [categories]="destinations()"
            [value]="reassignTo()"
            [placeholder]="text.reassignPlaceholder"
            [ariaLabel]="text.reassignLabel"
            (valueChange)="reassignTo.set($event)"
          />
        </div>
      } @else {
        <p class="mt-3 text-stone-600">{{ confirmMessage() }}</p>
      }

      @if (error()) {
        <p class="mt-4 text-sm text-red-700" role="alert">{{ error() }}</p>
      }

      <div class="mt-6 flex flex-wrap justify-end gap-3">
        <button
          appButton
          variant="secondary"
          type="button"
          (click)="cancelled.emit()"
        >
          {{ common.cancel }}
        </button>
        @if (mode() !== 'loading' && mode() !== 'blocked-children') {
          <button
            appButton
            variant="danger"
            type="button"
            class="gap-2"
            [disabled]="deleting() || (mode() === 'reassign' && !reassignTo())"
            (click)="confirm()"
          >
            <app-lucide-icon name="trash-2" class="h-4 w-4" />
            {{ deleting() ? text.deleting : text.delete }}
          </button>
        }
      </div>
    </dialog>
  `,
})
export class CategoryDeleteDialog {
  private readonly admin = inject(AdminCatalogService);
  protected readonly common = inject(ADMIN_TEXT).common;
  protected readonly text = inject(ADMIN_TEXT).categories;
  protected readonly productText = inject(ADMIN_TEXT).productEditor;

  private readonly dialog =
    viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  readonly slug = input.required<string>();
  readonly name = input.required<string>();
  readonly deleted = output<void>();
  readonly cancelled = output<void>();

  private readonly all = signal<AdminCategory[]>([]);
  private readonly self = signal<AdminCategory | null>(null);
  private readonly loading = signal(true);
  protected readonly deleting = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly reassignTo = signal('');

  protected readonly mode = computed<
    'loading' | 'blocked-children' | 'reassign' | 'confirm'
  >(() => {
    if (this.loading()) return 'loading';
    const self = this.self();
    if (!self || self.childCount > 0) return 'blocked-children';
    if (self.productCount > 0) return 'reassign';
    return 'confirm';
  });

  /** Categories the products can move to: everyone but this one and its
   * descendants (there are none in the reassign case, but guard anyway). */
  protected readonly destinations = computed<AdminCategory[]>(() => {
    const self = this.self();
    if (!self) return [];
    const banned = categoryDescendantIds(this.all(), self.id);
    banned.add(self.id);
    return this.all().filter((c) => !banned.has(c.id));
  });

  constructor() {
    // Load the categories BEFORE opening, so the modal appears already sized to
    // its final content (block / reassign / confirm) instead of flashing the
    // loading state and reflowing.
    afterNextRender(() => void this.open());
  }

  private async open(): Promise<void> {
    const categories = await this.admin.listCategories();
    this.all.set(categories);
    this.self.set(categories.find((c) => c.slug === this.slug()) ?? null);
    this.loading.set(false);
    this.dialog().nativeElement.showModal();
  }

  protected confirmMessage(): string {
    return this.text.deleteConfirm.replace('{name}', this.name());
  }

  protected blockedChildrenMessage(): string {
    return this.text.deleteBlockedChildren.replace('{name}', this.name());
  }

  protected reassignIntro(): string {
    return this.text.deleteReassignIntro
      .replace('{name}', this.name())
      .replace('{count}', String(this.self()?.productCount ?? 0));
  }

  protected async confirm(): Promise<void> {
    const self = this.self();
    if (!self) return;
    this.deleting.set(true);
    this.error.set(null);
    const result = await this.admin.deleteCategory(
      self.id,
      this.reassignTo() || undefined,
    );
    if (result.ok) {
      this.deleted.emit();
    } else {
      this.error.set(result.message || this.text.deleteError);
      this.deleting.set(false);
    }
  }
}
