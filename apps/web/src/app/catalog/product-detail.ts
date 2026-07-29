import { Component, inject, input, resource } from '@angular/core';
import { Router } from '@angular/router';
import { ProductDetail as ProductDetailModel } from '@b2b-catalog-platform/shared';
import { APP_TEXT } from '../config/app-text';
import { usePageSeo } from '../core/page-seo';
import { EditModeService } from '../admin/edit-mode.service';
import { ProductAdminControls } from '../admin/product-admin-controls';
import { CatalogService } from './catalog.service';
import { ProductDetailView } from './product-detail-view';

/**
 * The product page route (FR-CAT-05): loads a product by slug and renders it
 * through the shared presentational view, with load/not-found states and SEO.
 * In admin edit mode it lazy-loads inline edit/delete controls (FR-ADM-01), so
 * the public bundle carries none of the admin write client.
 */
@Component({
  selector: 'app-product-detail',
  imports: [ProductDetailView, ProductAdminControls],
  template: `
    <section class="pb-8 sm:pb-12">
      @if (product.error()) {
        <p class="text-stone-600">{{ text.loadError }}</p>
      } @else if (product.hasValue()) {
        @let item = product.value();
        @if (!item) {
          <p class="text-stone-600">{{ text.productNotFound }}</p>
        } @else {
          @defer (when editMode.enabled()) {
            @if (editMode.enabled()) {
              <app-product-admin-controls
                variant="bar"
                [slug]="item.slug"
                [name]="item.name"
                (deleted)="onDeleted(item)"
              />
            }
          }
          <app-product-detail-view [item]="item" />
        }
      } @else {
        <div class="grid animate-pulse gap-8 lg:grid-cols-2" aria-hidden="true">
          <div class="aspect-square rounded-xl bg-stone-200"></div>
          <div class="space-y-4">
            <div class="h-8 w-2/3 rounded bg-stone-200"></div>
            <div class="h-6 w-1/4 rounded bg-stone-200"></div>
            <div class="h-4 w-full rounded bg-stone-200"></div>
            <div class="h-4 w-5/6 rounded bg-stone-200"></div>
          </div>
        </div>
      }
    </section>
  `,
})
export class ProductDetail {
  private catalog = inject(CatalogService);
  private readonly router = inject(Router);
  protected readonly editMode = inject(EditModeService);
  protected readonly text = inject(APP_TEXT).catalog;

  slug = input.required<string>();

  protected product = resource({
    params: () => ({ slug: this.slug() }),
    loader: ({ params }) => this.catalog.getProduct(params.slug),
  });

  /** After a soft-delete from the product page, return to its category (the
   * product's public page will now 404). Restore lives in the admin panel. */
  protected onDeleted(item: ProductDetailModel): void {
    void this.router.navigate(['/catalog', item.category.slug]);
  }

  constructor() {
    usePageSeo({
      name: () => this.product.value()?.name,
      description: () =>
        plainTextExcerpt(this.product.value()?.descriptionHtml),
    });
  }
}

/** A meta-description excerpt from a product's rich-text description: tags
 * stripped, whitespace collapsed, trimmed to a sensible length. */
function plainTextExcerpt(html: string | undefined): string | undefined {
  if (!html) return undefined;
  const text = html
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return undefined;
  return text.length > 160 ? `${text.slice(0, 157).trimEnd()}…` : text;
}
