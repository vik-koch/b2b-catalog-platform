import {
  Component,
  effect,
  inject,
  input,
  output,
  resource,
  signal,
} from '@angular/core';
import { ProductListItem } from '@b2b-catalog-platform/shared';
import { ADMIN_TEXT } from '../config/admin-text';
import { PricePipe } from '../catalog/price.pipe';
import { Button } from '../ui/button';
import { LucideIcon } from '../ui/icons/lucide-icon';
import { AdminCatalogService } from './admin-catalog.service';

/**
 * The edit-mode "Deleted" overlay under a category grid (FR-ADM-01). It owns
 * `AdminCatalogService` and is only ever rendered inside a storefront
 * `@defer (when editMode)` block, so the admin write client stays out of the
 * public bundle. It fetches the soft-deleted products in the category's subtree
 * — a second, admin-only query that never runs for a visitor — and offers an
 * in-place restore. The public read path and its SSR output are untouched.
 *
 * `reloadToken` lets the host re-fetch after a delete/restore elsewhere on the
 * page; a restore here emits `restored` so the host can reload its live grid.
 */
@Component({
  selector: 'app-deleted-products-section',
  imports: [PricePipe, Button, LucideIcon],
  template: `
    @if (deleted.value(); as items) {
      @if (items.length) {
        <section class="mt-12 border-t border-border pt-8">
          <h2 class="text-lg font-semibold text-subtle">
            {{ text.deletedHeading }}
          </h2>
          <ul
            class="mt-5 grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
          >
            @for (item of items; track item.slug) {
              <li class="h-full">
                <div
                  class="flex h-full flex-col overflow-hidden rounded-lg border border-dashed border-border-strong bg-stone-50"
                >
                  <div class="aspect-square overflow-hidden bg-stone-100">
                    @if (item.images[0]; as image) {
                      <img
                        [src]="image.thumb"
                        [alt]="item.name"
                        class="h-full w-full object-cover opacity-50 grayscale"
                      />
                    }
                  </div>
                  <div class="flex flex-1 flex-col p-3">
                    <h3
                      class="line-clamp-2 text-sm text-subtle"
                      [title]="item.name"
                    >
                      {{ item.name }}
                    </h3>
                    <p class="mt-auto pt-2 font-bold text-stone-400">
                      {{ item.priceMinor | price }}
                    </p>
                    <button
                      appButton
                      variant="secondary"
                      type="button"
                      class="mt-3 gap-2"
                      [disabled]="restoring() === item.slug"
                      (click)="restore(item)"
                    >
                      <app-lucide-icon name="rotate-ccw" class="h-4 w-4" />
                      {{
                        restoring() === item.slug
                          ? text.restoring
                          : common.restore
                      }}
                    </button>
                  </div>
                </div>
              </li>
            }
          </ul>
          @if (error()) {
            <p class="mt-4 text-sm text-red-700" role="alert">{{ error() }}</p>
          }
        </section>
      }
    }
  `,
})
export class DeletedProductsSection {
  private readonly admin = inject(AdminCatalogService);
  protected readonly common = inject(ADMIN_TEXT).common;
  protected readonly text = inject(ADMIN_TEXT).editMode;

  readonly categorySlug = input.required<string>();
  /** Bump to force a re-fetch (e.g. after a delete elsewhere on the page). */
  readonly reloadToken = input(0);
  readonly restored = output<void>();
  /** Fires once the deleted set has settled (loaded or errored). The host gates
   * its edit affordances on this so they and this overlay appear together, with
   * no flash of controls before the "Deleted" block resolves. */
  readonly loaded = output<void>();

  protected readonly restoring = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);

  protected readonly deleted = resource({
    params: () => ({ slug: this.categorySlug(), token: this.reloadToken() }),
    loader: ({ params }) => this.admin.listDeletedProducts(params.slug),
  });

  constructor() {
    effect(() => {
      if (this.deleted.hasValue() || this.deleted.error()) this.loaded.emit();
    });
  }

  protected async restore(item: ProductListItem): Promise<void> {
    this.restoring.set(item.slug);
    this.error.set(null);
    try {
      await this.admin.restoreProduct(item.slug);
      this.restored.emit();
    } catch {
      this.error.set(this.text.restoreError);
    } finally {
      this.restoring.set(null);
    }
  }
}
