import { Component, computed, inject, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { APP_TEXT } from '../config/app-text';
import { Button } from '../ui/button';
import { LucideIcon } from '../ui/icons/lucide-icon';
import { AdminCatalogService } from './admin-catalog.service';

/**
 * Inline admin edit/delete controls for a single product (FR-ADM-01), in two
 * shapes: `overlay` (icon buttons pinned to a grid tile) and `bar` (labelled
 * buttons above the product page). It owns `AdminCatalogService` so that the
 * admin write client is pulled into this component's chunk only — the storefront
 * grid/detail lazy-load it via `@defer (when editMode.enabled())`, keeping the
 * public bundle free of admin code. Emits `deleted` for the host to react
 * (reload the grid / leave the page).
 */
@Component({
  selector: 'app-product-admin-controls',
  imports: [RouterLink, Button, LucideIcon],
  template: `
    @if (variant() === 'overlay') {
      <div class="absolute top-2 right-2 z-10 flex gap-1">
        <a
          [routerLink]="editLink()"
          class="rounded-md bg-white/90 p-1.5 text-stone-600 shadow-sm hover:text-primary"
          [attr.aria-label]="text.editProduct"
        >
          <app-lucide-icon name="pencil" class="h-4 w-4" />
        </a>
        <button
          type="button"
          class="rounded-md bg-white/90 p-1.5 text-stone-600 shadow-sm hover:text-red-700"
          [attr.aria-label]="text.deleteProduct"
          (click)="delete()"
        >
          <app-lucide-icon name="trash-2" class="h-4 w-4" />
        </button>
      </div>
    } @else {
      <div class="mb-4 flex flex-wrap gap-2">
        <a appButton class="gap-2" [routerLink]="editLink()">
          <app-lucide-icon name="pencil" class="h-4 w-4" />
          {{ text.editProduct }}
        </a>
        <button
          appButton
          variant="secondary"
          type="button"
          class="gap-2"
          (click)="delete()"
        >
          <app-lucide-icon name="trash-2" class="h-4 w-4" />
          {{ text.deleteProduct }}
        </button>
      </div>
    }
  `,
})
export class ProductAdminControls {
  private readonly admin = inject(AdminCatalogService);
  protected readonly text = inject(APP_TEXT).editMode;

  readonly slug = input.required<string>();
  readonly name = input.required<string>();
  readonly variant = input<'overlay' | 'bar'>('bar');
  readonly deleted = output<void>();

  protected readonly editLink = computed(() => [
    '/admin/products',
    this.slug(),
    'edit',
  ]);

  protected async delete(): Promise<void> {
    const message = this.text.deleteConfirm.replace('{name}', this.name());
    if (!window.confirm(message)) return;
    await this.admin.deleteProduct(this.slug());
    this.deleted.emit();
  }
}
