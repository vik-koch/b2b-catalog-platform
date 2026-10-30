import { Component, computed, inject, input, resource } from '@angular/core';
import {
  HiddenReasons,
  ProductDetail as ProductDetailModel,
} from '@b2b-catalog-platform/shared/core/catalog';
import { StatusBadge } from '@b2b-catalog-platform/ui/content/status-badge';
import {
  confirmRequest,
  ConfirmService,
} from '@b2b-catalog-platform/ui/overlay/confirm.service';
import { EDIT_MODE_CATALOG } from '../../../core/catalog/edit-mode-catalog';
import {
  PRODUCT_PAGE_COLUMNS,
  PRODUCT_PAGE_SECTION_CELL,
  ProductDetailView,
} from '../../../core/catalog/product-page/product-detail-view';
import { AuthService } from '../../../shared/auth/auth.service';
import { SHARED_TEXT } from '../../../shared/config/shared-text';
import { STOREFRONT_TEXT } from '../../../shared/config/storefront-text';
import { usePageSeo } from '../../../shared/core/page-seo';
import { EditActions } from '../../../shared/edit-mode/edit-actions';
import { editAwareContent } from '../../../shared/edit-mode/edit-aware-content';
import { injectEditorReturnParams } from '../../../shared/edit-mode/editor-return';
import { LoadErrorView } from '../../pages/load-error-view';
import { NotFoundView } from '../../pages/not-found-view';
import { CatalogService } from '../catalog.service';
import { hiddenProductText } from './hidden-product-text';

/**
 * The product page (FR-CAT-05). An admin also gets a product the public cannot
 * see (FR-ADM-06): where the public read finds nothing, the admin read is
 * asked, and a badge says why it is hidden. The admin client loads on demand,
 * keeping it out of the public bundle.
 */
@Component({
  selector: 'app-product-detail',
  imports: [
    ProductDetailView,
    NotFoundView,
    EditActions,
    LoadErrorView,
    StatusBadge,
  ],
  template: `
    <!-- Full width: the edit-mode icons sit in the same top-right corner on
         every storefront page. -->
    <section class="relative pb-6">
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
            <!-- The list is narrowed by name, the one thing both know, so a
                 near namesake may come along. -->
            <app-edit-actions
              [listLink]="['/admin/products']"
              [listParams]="{ searchTerm: item.name }"
              [listLabel]="editText.showInList"
              [editLink]="['/admin/products', item.slug, 'edit']"
              [editParams]="editorFrom()"
              [editLabel]="editText.editProduct"
              [publishLabel]="publishLabel(loaded.hidden, editText)"
              [published]="!loaded.hidden"
              (togglePublished)="togglePublished(item, loaded.hidden)"
            />
          }

          <!-- Nothing hidden can be bought, so nobody adds it from here. -->
          <app-product-detail-view
            [item]="item"
            [canAdd]="!loaded.hidden"
            [crumbInset]="!!editText()"
          >
            <span productStatus class="flex flex-wrap gap-1">
              @if (loaded.hidden; as hidden) {
                @if (statusText(); as status) {
                  @if (hidden.deleted) {
                    <span uiStatusBadge tone="danger">{{
                      status.deleted
                    }}</span>
                  } @else {
                    <span uiStatusBadge tone="waiting">{{
                      status.unpublished
                    }}</span>
                    @if (hidden.unpriced) {
                      <span uiStatusBadge tone="danger">{{
                        status.unpriced
                      }}</span>
                    }
                  }
                }
              }
            </span>
          </app-product-detail-view>
        }
      } @else if (showSkeleton()) {
        <div
          class="@container/product max-w-7xl animate-pulse"
          aria-hidden="true"
        >
          <!-- Breadcrumb and columns as loaded, so nothing shifts. -->
          <div class="mb-4 h-4 w-2/3 rounded-sm bg-skeleton sm:w-2/5"></div>
          <div class="mb-4 h-8 w-2/5 rounded-sm bg-skeleton"></div>
          <div [class]="columns">
            <div
              class="aspect-square w-full rounded-lg bg-skeleton md:max-w-120"
            ></div>
            <!-- The facts column, which only the widest shape has. -->
            <div
              class="hidden h-48 rounded-sm bg-skeleton
                     @min-[65rem]/product:block"
            ></div>
            <div class="h-64 rounded-lg bg-skeleton"></div>
            <div [class]="sectionCell + ' max-w-3xl space-y-4'">
              <div class="h-4 w-full rounded-sm bg-skeleton"></div>
              <div class="h-4 w-5/6 rounded-sm bg-skeleton"></div>
              <div class="h-4 w-4/6 rounded-sm bg-skeleton"></div>
            </div>
            <div
              [class]="sectionCell + ' h-24 max-w-xl rounded-sm bg-skeleton'"
            ></div>
          </div>
        </div>
      }
    </section>
  `,
})
export class ProductDetail {
  private readonly catalog = inject(CatalogService);
  private readonly adminCatalog = inject(EDIT_MODE_CATALOG);
  private readonly confirm = inject(ConfirmService);
  private readonly auth = inject(AuthService);
  protected readonly text = inject(STOREFRONT_TEXT).catalog;
  protected readonly actionText = inject(SHARED_TEXT).actions;
  protected readonly columns = PRODUCT_PAGE_COLUMNS;
  protected readonly sectionCell = PRODUCT_PAGE_SECTION_CELL;
  protected readonly editorFrom = injectEditorReturnParams();

  readonly slug = input.required<string>();

  protected readonly product = resource({
    params: () => ({ slug: this.slug() }),
    loader: async ({ params }): Promise<LoadedProduct | null> => {
      const item = await this.catalog.getProduct(params.slug);
      if (item) return { item, hidden: null };
      // An admin may still see it, hidden: the answer waits for the session.
      await this.auth.whenResolved();
      if (this.auth.user()?.role !== 'admin') return null;
      const page = await (await this.adminCatalog()).getPage(params.slug);
      return page && { item: page.product, hidden: page.hidden };
    },
  });

  private readonly hiddenText = hiddenProductText(
    () => this.product.hasValue() && !!this.product.value()?.hidden,
  );
  protected readonly statusText = this.hiddenText.status;

  private readonly content = editAwareContent({
    // A hidden page waits for its badge, so the name does not move.
    ready: computed(
      () =>
        this.product.hasValue() &&
        (!this.product.value()?.hidden || this.hiddenText.settled()),
    ),
    section: 'editMode',
  });
  protected readonly editText = this.content.controls;
  protected readonly showSkeleton = this.content.showSkeleton;
  /** Boxed: the answer may be `null` (no such product), which would read as
   * "not ready". */
  protected readonly shown = computed(() => {
    if (!this.content.ready()) return undefined;
    const value = this.product.value();
    return { item: value?.item ?? null, hidden: value?.hidden ?? null };
  });

  /** None for a deleted product: that goes back through the admin list. */
  protected publishLabel(
    hidden: HiddenReasons | null,
    text: { publishProduct: string; unpublishProduct: string },
  ): string | null {
    if (!hidden) return text.unpublishProduct;
    return hidden.deleted ? null : text.publishProduct;
  }

  /** The page stays and reads again. Unpublishing is confirmed, being a
   * delete's weight; an unpriced product says why it cannot be published. */
  protected async togglePublished(
    item: ProductDetailModel,
    hidden: HiddenReasons | null,
  ): Promise<void> {
    const text = this.editText();
    const noPrice = this.hiddenText.noPrice();
    if (!text || noPrice === null) return;
    if (hidden?.unpriced) {
      await this.confirm.tell({
        heading: text.unpricedTitle,
        message: noPrice,
        closeLabel: this.actionText.close,
      });
      return;
    }
    const admin = await this.adminCatalog();
    if (!hidden) {
      const confirmed = await this.confirm.ask({
        ...confirmRequest(text.unpublishConfirm, this.actionText.cancel),
        message: await admin.unpublishMessage(item, text),
        confirmVariant: 'danger',
      });
      if (!confirmed) return;
    }
    await admin.setPublished(item.slug, !!hidden);
    this.product.reload();
  }

  /** `value()` throws on an errored resource. */
  private readonly loaded = computed(() =>
    this.product.hasValue() ? this.product.value()?.item : undefined,
  );

  constructor() {
    // A hidden page is an admin's only; crawlers have no session to see one,
    // so the tag is the second line.
    usePageSeo({
      name: () => this.loaded()?.name,
      description: () => plainTextExcerpt(this.loaded()?.descriptionHtml),
      noindex: () => this.product.hasValue() && !!this.product.value()?.hidden,
    });
  }
}

/** `hidden` is null for a live product. */
interface LoadedProduct {
  item: ProductDetailModel;
  hidden: HiddenReasons | null;
}

/** A meta description from rich text. */
function plainTextExcerpt(html: string | undefined): string | undefined {
  if (!html) return undefined;
  const text = html
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return undefined;
  return text.length > 160 ? `${text.slice(0, 157).trimEnd()}…` : text;
}
