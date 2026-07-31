import {
  Component,
  computed,
  inject,
  input,
  resource,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { APP_TEXT } from '../config/app-text';
import { ADMIN_TEXT } from '../config/admin-text';
import { PricePipe } from '../catalog/price.pipe';
import { Button } from '../ui/button';
import { LucideIcon } from '../ui/icons/lucide-icon';
import { AdminCatalogService } from './admin-catalog.service';
import { ProductDeleteDialog } from './product-delete-dialog';

/**
 * The admin product list: every product including soft-deleted ones
 * (which the storefront never shows), each with edit and delete/restore actions.
 * This is where deletion is reversible — the public catalog only ever hides
 * deleted rows, so restoring one lives here rather than on the storefront.
 * Admin-only and client-rendered like the rest of the panel.
 */
@Component({
  selector: 'app-admin-product-list-page',
  imports: [RouterLink, PricePipe, Button, LucideIcon, ProductDeleteDialog],
  template: `
    <div class="mb-6 flex items-center justify-between gap-4">
      <h1 class="text-3xl font-bold tracking-tight">{{ text.title }}</h1>
      <a appButton routerLink="/admin/products/new" class="gap-2">
        <app-lucide-icon name="plus" class="h-4 w-4" />
        {{ editText.addProduct }}
      </a>
    </div>

    @if (products.error()) {
      <p class="text-stone-600" role="alert">{{ catalogText.loadError }}</p>
    } @else if (products.hasValue()) {
      @let data = products.value();
      @if (data.items.length === 0) {
        <p class="text-stone-600">{{ text.empty }}</p>
      } @else {
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-stone-200 text-left text-stone-500">
              <th class="w-14 py-2"></th>
              <th class="py-2 font-medium">{{ productText.name }}</th>
              <th class="py-2 font-medium">{{ productText.category }}</th>
              <th class="py-2 text-right font-medium">
                {{ productText.price }}
              </th>
              <th class="w-32 py-2"></th>
            </tr>
          </thead>
          <tbody class="divide-y divide-stone-100">
            @for (item of data.items; track item.slug) {
              <tr [class.opacity-50]="item.deletedAt">
                <td class="py-2">
                  <div
                    class="h-10 w-10 overflow-hidden rounded border border-stone-200 bg-stone-100"
                  >
                    @if (item.thumb) {
                      <img
                        [src]="item.thumb"
                        alt=""
                        class="h-full w-full object-cover"
                      />
                    }
                  </div>
                </td>
                <td class="py-2">
                  <a
                    [routerLink]="['/admin/products', item.slug, 'edit']"
                    class="font-medium text-stone-700 hover:text-primary"
                  >
                    {{ item.name }}
                  </a>
                  @if (item.deletedAt) {
                    <span
                      class="ml-2 rounded bg-stone-200 px-1.5 py-0.5 text-xs text-stone-600"
                    >
                      {{ text.deletedBadge }}
                    </span>
                  }
                </td>
                <td class="py-2 text-stone-500">
                  {{ categoryName().get(item.categoryId) }}
                </td>
                <td class="py-2 text-right text-stone-700">
                  {{ item.priceMinor | price }}
                </td>
                <td class="py-2">
                  <div class="flex items-center justify-end gap-1">
                    <a
                      [routerLink]="['/admin/products', item.slug, 'edit']"
                      class="p-1.5 text-stone-500 hover:text-primary"
                      [attr.aria-label]="editText.editProduct"
                    >
                      <app-lucide-icon name="pencil" class="h-4 w-4" />
                    </a>
                    @if (item.deletedAt) {
                      <button
                        type="button"
                        class="p-1.5 text-stone-500 hover:text-primary"
                        [attr.aria-label]="common.restore"
                        (click)="restore(item)"
                      >
                        <app-lucide-icon name="rotate-ccw" class="h-4 w-4" />
                      </button>
                    } @else {
                      <button
                        type="button"
                        class="p-1.5 text-stone-500 hover:text-red-700"
                        [attr.aria-label]="editText.deleteProduct"
                        (click)="deletingProduct.set(item)"
                      >
                        <app-lucide-icon name="trash-2" class="h-4 w-4" />
                      </button>
                    }
                  </div>
                </td>
              </tr>
            }
          </tbody>
        </table>

        @if (data.pagination.totalPages > 1) {
          <nav
            class="mt-8 flex items-center justify-center gap-4 text-sm"
            [attr.aria-label]="catalogText.pageStatus"
          >
            @if (data.pagination.page > 1) {
              <a
                routerLink="/admin/products"
                [queryParams]="{ page: data.pagination.page - 1 }"
                appButton
                variant="ghost"
                size="sm"
                >{{ catalogText.prevPage }}</a
              >
            } @else {
              <span class="px-3 py-1.5 text-stone-300">{{
                catalogText.prevPage
              }}</span>
            }
            <span class="text-stone-500">{{
              pageStatus(data.pagination)
            }}</span>
            @if (data.pagination.page < data.pagination.totalPages) {
              <a
                routerLink="/admin/products"
                [queryParams]="{ page: data.pagination.page + 1 }"
                appButton
                variant="ghost"
                size="sm"
                >{{ catalogText.nextPage }}</a
              >
            } @else {
              <span class="px-3 py-1.5 text-stone-300">{{
                catalogText.nextPage
              }}</span>
            }
          </nav>
        }
      }
    } @else {
      <p class="text-stone-500" role="status">…</p>
    }

    @if (deletingProduct(); as target) {
      <app-product-delete-dialog
        [slug]="target.slug"
        [name]="target.name"
        (deleted)="onProductDeleted()"
        (cancelled)="deletingProduct.set(null)"
      />
    }
  `,
})
export class AdminProductListPage {
  private readonly admin = inject(AdminCatalogService);
  protected readonly common = inject(ADMIN_TEXT).common;
  protected readonly text = inject(ADMIN_TEXT).productList;
  protected readonly editText = inject(ADMIN_TEXT).editMode;
  protected readonly productText = inject(ADMIN_TEXT).productEditor;
  protected readonly catalogText = inject(APP_TEXT).catalog;

  /** Bound from the `page` query param (a string); coerced and floored to 1. */
  page = input('1');
  protected currentPage = computed(() => {
    const n = Number(this.page());
    return Number.isInteger(n) && n > 0 ? n : 1;
  });

  private readonly categories = resource({
    loader: () => this.admin.listCategories(),
  });
  protected readonly categoryName = computed(
    () => new Map((this.categories.value() ?? []).map((c) => [c.id, c.name])),
  );

  protected products = resource({
    params: () => ({ page: this.currentPage() }),
    loader: ({ params }) => this.admin.listProducts({ page: params.page }),
  });

  /** The product whose delete confirmation modal is open, if any. */
  protected readonly deletingProduct = signal<{
    slug: string;
    name: string;
  } | null>(null);

  protected onProductDeleted(): void {
    this.deletingProduct.set(null);
    this.products.reload();
  }

  protected async restore(item: { slug: string }): Promise<void> {
    await this.admin.restoreProduct(item.slug);
    this.products.reload();
  }

  protected pageStatus(p: { page: number; totalPages: number }): string {
    return this.catalogText.pageStatus
      .replace('{page}', String(p.page))
      .replace('{total}', String(p.totalPages));
  }
}
