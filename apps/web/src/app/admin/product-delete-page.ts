import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ProductDetail } from '@b2b-catalog-platform/shared';
import { APP_TEXT } from '../config/app-text';
import { CatalogService } from '../catalog/catalog.service';
import { Button } from '../ui/button';
import { LucideIcon } from '../ui/icons/lucide-icon';
import { AdminCatalogService } from './admin-catalog.service';

/**
 * Delete-a-product confirmation (FR-ADM-01) on its own admin route,
 * `/admin/products/:slug/delete`. Making delete a route — rather than a control
 * embedded in the storefront — is what keeps the admin write client out of the
 * public bundle entirely: the storefront's edit/delete affordances are plain
 * links, and only this lazy admin chunk injects `AdminCatalogService`. The
 * product is read through the public `CatalogService` (it isn't deleted yet), so
 * we can show its name and return to its category afterwards. Browser-only.
 */
@Component({
  selector: 'app-product-delete-page',
  imports: [Button, LucideIcon],
  template: `
    @if (loading()) {
      <p class="text-stone-500" role="status">…</p>
    } @else if (product(); as item) {
      <div class="mx-auto max-w-md rounded-lg border border-stone-200 p-6">
        <h1 class="text-xl font-bold tracking-tight">
          {{ editText.deleteProduct }}
        </h1>
        <p class="mt-3 text-stone-600">{{ confirmMessage(item.name) }}</p>

        @if (error()) {
          <p class="mt-4 text-sm text-red-700" role="alert">{{ error() }}</p>
        }

        <div class="mt-6 flex flex-wrap gap-3">
          <button
            appButton
            variant="danger"
            type="button"
            class="gap-2"
            [disabled]="deleting()"
            (click)="confirm(item)"
          >
            <app-lucide-icon name="trash-2" class="h-4 w-4" />
            {{ editText.deleteProduct }}
          </button>
          <button
            appButton
            variant="secondary"
            type="button"
            (click)="cancel(item)"
          >
            {{ productText.cancel }}
          </button>
        </div>
      </div>
    } @else {
      <p class="text-stone-600" role="alert">
        {{ catalogText.productNotFound }}
      </p>
    }
  `,
})
export class ProductDeletePage {
  private readonly admin = inject(AdminCatalogService);
  private readonly catalog = inject(CatalogService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  protected readonly editText = inject(APP_TEXT).editMode;
  protected readonly productText = inject(APP_TEXT).productEditor;
  protected readonly catalogText = inject(APP_TEXT).catalog;

  private readonly slug = this.route.snapshot.paramMap.get('slug') ?? '';

  protected readonly loading = signal(true);
  protected readonly deleting = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly product = signal<ProductDetail | null>(null);

  constructor() {
    void this.load();
  }

  private async load(): Promise<void> {
    this.product.set(await this.catalog.getProduct(this.slug));
    this.loading.set(false);
  }

  protected confirmMessage(name: string): string {
    return this.editText.deleteConfirm.replace('{name}', name);
  }

  protected async confirm(item: ProductDetail): Promise<void> {
    this.deleting.set(true);
    this.error.set(null);
    try {
      await this.admin.deleteProduct(item.slug);
      // The product's public page will now 404, so return to its category.
      // Restore lives in the admin product list.
      await this.router.navigate(['/catalog', item.category.slug]);
    } catch {
      this.error.set(this.productText.saveError);
      this.deleting.set(false);
    }
  }

  protected cancel(item: ProductDetail): void {
    void this.router.navigate(['/product', item.slug]);
  }
}
