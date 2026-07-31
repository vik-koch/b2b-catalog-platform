import {
  Component,
  computed,
  inject,
  input,
  resource,
  signal,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ProductDetail as ProductDetailModel } from '@b2b-catalog-platform/shared';
import { APP_TEXT } from '../config/app-text';
import { delayedLoading } from '../core/delayed-loading';
import { adminText } from '../config/admin-text';
import { usePageSeo } from '../core/page-seo';
import { EditModeService } from '../admin/edit-mode.service';
import { ProductDeleteDialog } from '../admin/product-delete-dialog';
import { IconButton } from '../ui/icon-button';
import { LucideIcon } from '../ui/icons/lucide-icon';
import { NotFoundView } from '../pages/not-found-view';
import { CatalogService } from './catalog.service';
import { ProductDetailView } from './product-detail-view';

/**
 * The product page route (FR-CAT-05): loads a product by slug and renders it
 * through the shared presentational view, with load/not-found states and SEO.
 * In admin edit mode it shows edit/delete icons anchored to the section's
 * top-right corner (a consistent spot across the storefront) — edit links to
 * the editor; delete opens a confirmation modal lazy-loaded via `@defer`, so the
 * public bundle carries no admin write client.
 */
@Component({
  selector: 'app-product-detail',
  imports: [
    ProductDetailView,
    ProductDeleteDialog,
    NotFoundView,
    RouterLink,
    IconButton,
    LucideIcon,
  ],
  template: `
    <section class="relative pb-8 sm:pb-12">
      @if (product.error()) {
        <p class="text-muted">{{ text.loadError }}</p>
      } @else if (product.hasValue()) {
        @let item = product.value();
        @if (!item) {
          <app-not-found-view
            [body]="text.productNotFound"
            backLink="/catalog"
            [backLabel]="text.backToCatalog"
          />
        } @else {
          @if (editText(); as editText) {
            <div class="absolute top-0 right-0 z-10 flex gap-2">
              <a
                appIconButton
                [routerLink]="['/admin/products', item.slug, 'edit']"
                [attr.aria-label]="editText.editProduct"
                [attr.title]="editText.editProduct"
              >
                <app-lucide-icon name="pencil" class="h-5 w-5" />
              </a>
              <button
                appIconButton
                variant="danger"
                type="button"
                [attr.aria-label]="editText.deleteProduct"
                [attr.title]="editText.deleteProduct"
                (click)="confirmingDelete.set(true)"
              >
                <app-lucide-icon name="trash-2" class="h-5 w-5" />
              </button>
            </div>
          }

          <app-product-detail-view [item]="item" />

          @defer (when confirmingDelete()) {
            @if (confirmingDelete()) {
              <app-product-delete-dialog
                [slug]="item.slug"
                [name]="item.name"
                (deleted)="onDeleted(item)"
                (cancelled)="confirmingDelete.set(false)"
              />
            }
          }
        }
      } @else if (showSkeleton()) {
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
  /**
   * Edit-mode wording, non-null only once edit mode is on — which implies the
   * admin text has arrived (see EditModeService). Read as a signal rather than
   * injected, because this component also renders for anonymous visitors, who
   * never fetch that text.
   */
  protected readonly editText = computed(() =>
    this.editMode.enabled() ? (adminText()?.editMode ?? null) : null,
  );

  slug = input.required<string>();
  protected readonly confirmingDelete = signal(false);

  protected product = resource({
    params: () => ({ slug: this.slug() }),
    loader: ({ params }) => this.catalog.getProduct(params.slug),
  });

  /** Delayed so a quick load never flashes a skeleton. */
  protected readonly showSkeleton = delayedLoading(this.product.isLoading);

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
