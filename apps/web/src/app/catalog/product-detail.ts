import {
  Component,
  computed,
  inject,
  Injector,
  input,
  resource,
  effect,
  DestroyRef,
  PLATFORM_ID,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import {
  ProductDetail as ProductDetailModel,
  ProductPage,
} from '@b2b-catalog-platform/shared';
import { Meta } from '@angular/platform-browser';
import { adminText, loadAdminText } from '../config/admin-text';
import { StatusBadge } from '../ui/status-badge';
import { isPlatformBrowser } from '@angular/common';
import { AuthService } from '../auth/auth.service';
import { EditActions } from '../admin/edit-actions';
import { editAwareContent } from '../admin/edit-aware-content';
import { injectEditorReturnParams } from '../admin/editor-return';
import { APP_TEXT } from '../config/app-text';
import { usePageSeo } from '../core/page-seo';
import { LoadErrorView } from '../pages/load-error-view';
import { NotFoundView } from '../pages/not-found-view';
import { ConfirmService } from '../ui/confirm.service';
import { CatalogService } from './catalog.service';
import {
  PRODUCT_PAGE_COLUMNS,
  PRODUCT_PAGE_SECTION_CELL,
  ProductDetailView,
} from './product-detail-view';

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
                    <span appStatusBadge tone="danger">{{
                      status.deletedBadge
                    }}</span>
                  } @else {
                    <span appStatusBadge tone="waiting">{{
                      status.unpublishedBadge
                    }}</span>
                    @if (hidden.unpriced) {
                      <span appStatusBadge tone="danger">{{
                        status.unpricedBadge
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
          <div class="mb-4 h-4 w-2/3 rounded bg-stone-200 sm:w-2/5"></div>
          <div class="mb-4 h-8 w-2/5 rounded bg-stone-200"></div>
          <!-- The page's own columns, so nothing moves sideways when the real
               content arrives. -->
          <div [class]="columns">
            <div
              class="aspect-square w-full rounded-xl bg-stone-200 md:max-w-120"
            ></div>
            <!-- The facts column, which only the widest shape has. -->
            <div
              class="hidden h-48 rounded bg-stone-200 @min-[65rem]/product:block"
            ></div>
            <div class="h-64 rounded-xl bg-stone-200"></div>
            <div [class]="sectionCell + ' max-w-3xl space-y-4'">
              <div class="h-4 w-full rounded bg-stone-200"></div>
              <div class="h-4 w-5/6 rounded bg-stone-200"></div>
              <div class="h-4 w-4/6 rounded bg-stone-200"></div>
            </div>
            <div
              [class]="sectionCell + ' h-24 max-w-xl rounded bg-stone-200'"
            ></div>
          </div>
        </div>
      }
    </section>
  `,
})
export class ProductDetail {
  private catalog = inject(CatalogService);
  private readonly injector = inject(Injector);
  private readonly confirm = inject(ConfirmService);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  protected readonly text = inject(APP_TEXT).catalog;
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
      const { AdminCatalogService } =
        await import('../admin/admin-catalog.service');
      const page = await this.injector
        .get(AdminCatalogService)
        .getProductPage(params.slug);
      return page && { item: page.product, hidden: page.hidden };
    },
  });

  /** The badge wording, fetched like every admin word: null until it has
   * arrived, or for good where fetching it failed. */
  protected readonly statusText = computed(() => adminText()?.editMode ?? null);
  private readonly textFailed = signal(false);
  private readonly statusSettled = computed(
    () => this.statusText() !== null || this.textFailed(),
  );

  /** The product and its edit affordances appear together, once the product
   * and the visitor's role are both known — see editAwareContent. */
  private readonly content = editAwareContent({
    // A hidden page is drawn with its badge or not at all, so the name does
    // not move when the badge arrives. Only an admin reaches one.
    ready: computed(
      () =>
        this.product.hasValue() &&
        (!this.product.value()?.hidden || this.statusSettled()),
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
    hidden: ProductPage['hidden'] | null,
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
    hidden: ProductPage['hidden'] | null,
  ): Promise<void> {
    const text = this.editText();
    const all = adminText();
    if (!text || !all) return;
    if (hidden?.unpriced) {
      await this.confirm.tell({
        heading: text.unpricedTitle,
        message: all.common.catalogErrors['product-has-no-price'],
        closeLabel: all.common.close,
      });
      return;
    }
    // Imported here, not at the top: the admin catalog service — and the
    // whole admin contract behind it — stays out of every visitor's first
    // load.
    const { AdminCatalogService } =
      await import('../admin/admin-catalog.service');
    const admin = this.injector.get(AdminCatalogService);
    if (!hidden) {
      const confirmed = await this.confirm.ask({
        heading: text.unpublishProduct,
        message: await admin.unpublishMessage(item, text),
        confirmLabel: text.unpublishProduct,
        cancelLabel: text.cancel,
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
    // Fetched only once a hidden page is in hand, which only an admin has; in
    // the browser only, where the file is served — the server's render keeps
    // the placeholder, and the browser's first frame matches it.
    if (isPlatformBrowser(inject(PLATFORM_ID))) {
      effect(() => {
        if (this.product.hasValue() && this.product.value()?.hidden) {
          loadAdminText().catch(() => this.textFailed.set(true));
        }
      });
    }
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
  hidden: ProductPage['hidden'] | null;
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
