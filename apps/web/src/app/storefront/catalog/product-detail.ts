import {
  Component,
  computed,
  inject,
  input,
  resource,
  effect,
  DestroyRef,
} from '@angular/core';
import { Router } from '@angular/router';
import {
  HiddenReasons,
  ProductDetail as ProductDetailModel,
} from '@b2b-catalog-platform/shared/core/catalog';
import { Meta } from '@angular/platform-browser';
import { hiddenProductText } from '../../core/catalog/hidden-product-text';
import { StatusBadge } from '@b2b-catalog-platform/ui/content/status-badge';
import { AuthService } from '../../shared/auth/auth.service';
import { EditActions } from '../../shared/edit-mode/edit-actions';
import { editAwareContent } from '../../shared/edit-mode/edit-aware-content';
import { EDIT_MODE_CATALOG } from '../../core/catalog/edit-mode-catalog';
import { injectEditorReturnParams } from '../../shared/edit-mode/editor-return';
import { STOREFRONT_TEXT } from '../../shared/config/storefront-text';
import { usePageSeo } from '../../shared/core/page-seo';
import { LoadErrorView } from '../pages/load-error-view';
import { NotFoundView } from '../pages/not-found-view';
import {
  confirmRequest,
  ConfirmService,
} from '@b2b-catalog-platform/ui/overlay/confirm.service';
import { CatalogService } from './catalog.service';
import {
  PRODUCT_PAGE_COLUMNS,
  PRODUCT_PAGE_SECTION_CELL,
  ProductDetailView,
} from '../../core/catalog/product-detail-view';
import { SHARED_TEXT } from '../../shared/config/shared-text';

/**
 * The product page route (FR-CAT-05): loads a product by slug and renders it
 * through the shared presentational view, with load/not-found states and SEO.
 * In admin edit mode it shows edit/delete icons anchored to the section's
 * top-right corner (a consistent spot across the storefront) — edit links to
 * the editor, and unpublish beside it, since removal starts there
 * (FR-ADM-01).
 *
 * An admin also gets the page of a product the public cannot see — unpublished,
 * unpriced or deleted (FR-ADM-06): where the public read finds nothing, it asks
 * the admin read. A badge beside the name says why it is hidden, drawn with
 * the page — which waits for the fetched admin wording to do so, so nothing
 * jumps — and the edit actions publish it again. Deleting, restoring and
 * deleting permanently stay in the admin list. Everyone else gets the
 * not-found page. The admin client is imported on demand, so the public bundle
 * carries no admin write client.
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
    <!-- The section keeps the frame's full width, because the edit-mode icons
         are anchored to its top-right corner and that corner is the same one
         on every storefront page. The narrower page width belongs to the
         content inside it (see ProductDetailView). -->
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
            <!-- Publication is the one step taken from the page, either way;
                 a deleted product goes back through the admin list. The list
                 is narrowed by name, the one thing the storefront knows that
                 it searches, so a near namesake may come along. -->
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
          <!-- The breadcrumb is part of the loaded page, so it is part of the
               placeholder too — otherwise everything below shifts up a row
               when the real content arrives. -->
          <div class="mb-4 h-4 w-2/3 rounded-sm bg-skeleton sm:w-2/5"></div>
          <div class="mb-4 h-8 w-2/5 rounded-sm bg-skeleton"></div>
          <!-- The page's own columns, so nothing moves sideways when the real
               content arrives. -->
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
  private catalog = inject(CatalogService);
  private readonly adminCatalog = inject(EDIT_MODE_CATALOG);
  private readonly confirm = inject(ConfirmService);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  protected readonly text = inject(STOREFRONT_TEXT).catalog;
  protected readonly actionText = inject(SHARED_TEXT).actions;
  protected readonly columns = PRODUCT_PAGE_COLUMNS;
  protected readonly sectionCell = PRODUCT_PAGE_SECTION_CELL;
  protected readonly editorFrom = injectEditorReturnParams();

  slug = input.required<string>();

  protected product = resource({
    params: () => ({ slug: this.slug() }),
    loader: async ({ params }): Promise<LoadedProduct | null> => {
      const item = await this.catalog.getProduct(params.slug);
      if (item) return { item, hidden: null };
      // Nothing the public may see. An admin may still see it, hidden: the
      // session decides, so the answer waits for it.
      await this.auth.whenResolved();
      if (this.auth.user()?.role !== 'admin') return null;
      const page = await (
        await this.adminCatalog()
      ).getProductPage(params.slug);
      return page && { item: page.product, hidden: page.hidden };
    },
  });

  private readonly hiddenText = hiddenProductText(
    () => this.product.hasValue() && !!this.product.value()?.hidden,
  );
  protected readonly statusText = this.hiddenText.status;

  /** The product and its edit affordances appear together, once the product
   * and the visitor's role are both known — see editAwareContent. */
  private readonly content = editAwareContent({
    // A hidden page is drawn with its badge or not at all, so the name does
    // not move when the badge arrives. Only an admin reaches one.
    ready: computed(
      () =>
        this.product.hasValue() &&
        (!this.product.value()?.hidden || this.hiddenText.settled()),
    ),
    section: 'editMode',
  });
  protected readonly editText = this.content.controls;
  protected readonly showSkeleton = this.content.showSkeleton;
  /**
   * The answer, once it may be shown — boxed, because the answer itself may be
   * `null` (no such product) and a bare null would read as "not ready".
   */
  protected readonly shown = computed(() => {
    if (!this.content.ready()) return undefined;
    const value = this.product.value();
    return { item: value?.item ?? null, hidden: value?.hidden ?? null };
  });

  /** Publish on a hidden page — unless it is deleted, which goes back through
   * the admin list — and unpublish on a live one. */
  protected publishLabel(
    hidden: HiddenReasons | null,
    text: { publishProduct: string; unpublishProduct: string },
  ): string | null {
    if (!hidden) return text.unpublishProduct;
    return hidden.deleted ? null : text.publishProduct;
  }

  /**
   * Publication from the page, either way, and the page stays where it is and
   * reads again — for the admin unpublishing, the same product with its badge
   * now saying it is hidden. Unpublishing is confirmed, because taking a
   * product off sale is the weight of a delete; publishing an unpriced product
   * says why it cannot be, as the admin list does.
   */
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
    // Loaded on first use: the admin catalog client, and the whole admin
    // contract behind it, stays out of every visitor's first load.
    const admin = await this.adminCatalog();
    if (!hidden) {
      const confirmed = await this.confirm.ask({
        ...confirmRequest(text.unpublishConfirm, this.actionText.cancel),
        message: await admin.unpublishMessage(item, text),
        confirmVariant: 'danger',
      });
      if (!confirmed) return;
    }
    await admin.setProductPublished(item.slug, !!hidden);
    this.product.reload();
  }

  /** Value only when there is one — `value()` throws on an errored resource. */
  private readonly loaded = computed(() =>
    this.product.hasValue() ? this.product.value()?.item : undefined,
  );

  constructor() {
    usePageSeo({
      name: () => this.loaded()?.name,
      description: () => plainTextExcerpt(this.loaded()?.descriptionHtml),
    });
    // A hidden page is an admin's only, and never indexed. Only crawlers read
    // it, and they have no session to be shown one with; this is the second
    // line, in the document itself.
    // Removed again when the same page goes live (an admin publishing it) or
    // is left, so an ordinary page reached afterwards does not inherit it.
    // Only a tag this page added is taken away: a deployment that is itself
    // non-indexable carries its own (seo.server.ts), which must stay.
    const meta = inject(Meta);
    let added = false;
    const unmark = () => {
      if (added) meta.removeTag('name="robots"');
      added = false;
    };
    effect(() => {
      const hidden = this.product.hasValue() && !!this.product.value()?.hidden;
      if (hidden && !meta.getTag('name="robots"')) {
        meta.addTag({ name: 'robots', content: 'noindex' });
        added = true;
      } else if (!hidden) {
        unmark();
      }
    });
    inject(DestroyRef).onDestroy(unmark);
  }
}

/** The page, and why the public cannot see it — null for a live product. */
interface LoadedProduct {
  item: ProductDetailModel;
  hidden: HiddenReasons | null;
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
