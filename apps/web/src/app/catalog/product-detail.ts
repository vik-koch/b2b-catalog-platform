import {
  Component,
  computed,
  inject,
  input,
  resource,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import { ProductDetail as ProductDetailModel } from '@b2b-catalog-platform/shared';
import { APP_TEXT } from '../config/app-text';
import { LoadErrorView } from '../pages/load-error-view';
import { injectEditorReturnParams } from '../admin/editor-return';
import { editAwareContent } from '../admin/edit-aware-content';
import { EditActions } from '../admin/edit-actions';
import { usePageSeo } from '../core/page-seo';
import { ProductDeleteDialog } from '../admin/products/product-delete-dialog';
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
    EditActions,
    LoadErrorView,
  ],
  template: `
    <section class="relative pb-8 sm:pb-12">
      @if (product.error()) {
        <app-load-error-view [message]="text.loadError" />
      } @else if (shown(); as loaded) {
        @let item = loaded.item;
        @if (!item) {
          <app-not-found-view
            [body]="text.productNotFound"
            backLink="/catalog"
            [backLabel]="text.backToCatalog"
          />
        } @else {
          @if (editText(); as editText) {
            <app-edit-actions
              [editLink]="['/admin/products', item.slug, 'edit']"
              [editParams]="editorFrom"
              [editLabel]="editText.editProduct"
              [deleteLabel]="editText.deleteProduct"
              (remove)="confirmingDelete.set(true)"
            />
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
        <div class="animate-pulse" aria-hidden="true">
          <!-- The breadcrumb is part of the loaded page, so it is part of the
               placeholder too — otherwise everything below shifts up a row
               when the real content arrives. -->
          <div class="mb-6 h-4 w-2/3 rounded bg-stone-200 sm:w-2/5"></div>
          <div class="grid gap-8 lg:grid-cols-2">
            <div class="aspect-square rounded-xl bg-stone-200"></div>
            <div class="space-y-4">
              <div class="h-8 w-2/3 rounded bg-stone-200"></div>
              <div class="h-6 w-1/4 rounded bg-stone-200"></div>
              <div class="h-4 w-full rounded bg-stone-200"></div>
              <div class="h-4 w-5/6 rounded bg-stone-200"></div>
            </div>
          </div>
        </div>
      }
    </section>
  `,
})
export class ProductDetail {
  private catalog = inject(CatalogService);
  private readonly router = inject(Router);
  protected readonly text = inject(APP_TEXT).catalog;
  protected readonly editorFrom = injectEditorReturnParams();

  slug = input.required<string>();
  protected readonly confirmingDelete = signal(false);

  protected product = resource({
    params: () => ({ slug: this.slug() }),
    loader: ({ params }) => this.catalog.getProduct(params.slug),
  });

  /** The product and its edit affordances appear together, once the product
   * and the visitor's role are both known — see editAwareContent. */
  private readonly content = editAwareContent({
    ready: computed(() => this.product.hasValue()),
    section: 'editMode',
  });
  protected readonly editText = this.content.controls;
  protected readonly showSkeleton = this.content.showSkeleton;
  /**
   * The answer, once it may be shown — boxed, because the answer itself may be
   * `null` (no such product) and a bare null would read as "not ready".
   */
  protected readonly shown = computed(() =>
    this.content.ready() ? { item: this.product.value() } : undefined,
  );

  /** After a soft-delete from the product page, return to its category (the
   * product's public page will now 404). Restore lives in the admin panel. */
  protected onDeleted(item: ProductDetailModel): void {
    void this.router.navigate(['/catalog', item.category.slug]);
  }

  /** Value only when there is one — `value()` throws on an errored resource. */
  private readonly loaded = computed(() =>
    this.product.hasValue() ? this.product.value() : undefined,
  );

  constructor() {
    usePageSeo({
      name: () => this.loaded()?.name,
      description: () => plainTextExcerpt(this.loaded()?.descriptionHtml),
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
