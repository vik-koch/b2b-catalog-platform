import {
  afterNextRender,
  Component,
  ElementRef,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { ADMIN_TEXT } from '../../config/admin-text';
import { Button } from '../../ui/button';
import { DialogPanel } from '../../ui/dialog-panel';
import { AdminIcon } from '../../ui/icons/admin-icon';
import { AdminCatalogService } from '../admin-catalog.service';

/**
 * Delete-a-product confirmation modal (FR-ADM-01). It owns `AdminCatalogService`
 * and is only ever rendered inside a storefront `@defer (when …)` block, so the
 * admin write client lands in a lazily-loaded chunk rather than the public
 * bundle. A native `<dialog>` in modal mode (as `ForcePasswordChange`): the
 * focus trap, inert background, top-layer and Esc handling come from the
 * platform. It emits `deleted` (the host reloads its grid / leaves the page) or
 * `cancelled` (dismissed) — it never navigates itself.
 */
@Component({
  selector: 'app-product-delete-dialog',
  imports: [Button, AdminIcon, DialogPanel],
  template: `
    <dialog
      #dialog
      (cancel)="cancelled.emit()"
      aria-labelledby="product-delete-heading"
      appDialogPanel
    >
      <h2 id="product-delete-heading" class="text-xl font-bold tracking-tight">
        {{ text.deleteProduct }}
      </h2>
      <p class="mt-3 text-muted">{{ confirmMessage() }}</p>

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
        <button
          appButton
          variant="danger"
          type="button"
          class="gap-2"
          [disabled]="deleting()"
          (click)="confirm()"
        >
          <app-admin-icon name="trash-2" class="h-4 w-4" />
          {{ text.deleteProduct }}
        </button>
      </div>
    </dialog>
  `,
})
export class ProductDeleteDialog {
  private readonly admin = inject(AdminCatalogService);
  protected readonly common = inject(ADMIN_TEXT).common;
  protected readonly text = inject(ADMIN_TEXT).editMode;
  protected readonly productText = inject(ADMIN_TEXT).productEditor;

  private readonly dialog =
    viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  readonly slug = input.required<string>();
  readonly name = input.required<string>();
  readonly deleted = output<void>();
  readonly cancelled = output<void>();

  protected readonly deleting = signal(false);
  protected readonly error = signal<string | null>(null);

  constructor() {
    // showModal() must be called imperatively for the focus trap and backdrop;
    // the host removes this component to close, and a removed dialog is closed.
    afterNextRender(() => this.dialog().nativeElement.showModal());
  }

  protected confirmMessage(): string {
    return this.text.deleteConfirm.replace('{name}', this.name());
  }

  protected async confirm(): Promise<void> {
    this.deleting.set(true);
    this.error.set(null);
    try {
      await this.admin.deleteProduct(this.slug());
      this.deleted.emit();
    } catch {
      this.error.set(this.productText.saveError);
      this.deleting.set(false);
    }
  }
}
