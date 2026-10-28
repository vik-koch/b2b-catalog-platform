import {
  Component,
  effect,
  inject,
  input,
  output,
  resource,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { HiddenProduct } from '@b2b-catalog-platform/shared';
import {
  NARROW_BODY_IN_GRID,
  NARROW_PADDING_IN_GRID,
  NARROW_PHOTO_IN_GRID,
} from '../catalog/listing-narrow';
import { PricePipe } from '../catalog/price.pipe';
import { PRODUCT_GRID } from '../catalog/product-tile';
import { ADMIN_TEXT } from '../config/admin-text';
import { Button } from '@b2b-catalog-platform/ui/actions/button';
import { ConfirmService } from '../ui/confirm.service';
import { Icon } from '@b2b-catalog-platform/ui/icons/icon';
import { StatusBadge } from '../ui/status-badge';
import { EDIT_MODE_CATALOG } from './edit-mode-catalog';
import { injectEditorReturnParams } from './editor-return';
import { SHARED_TEXT } from '../config/shared-text';
import { ErrorText } from '../ui/error-text';
import { bookCheckIcon } from '@b2b-catalog-platform/ui/icons/glyphs/book-check';
import { pencilIcon } from '@b2b-catalog-platform/ui/icons/glyphs/pencil';

/**
 * The edit-mode overlay under a category grid (FR-ADM-06): what this category
 * holds that the storefront does not show, its unpublished products. Without
 * it the grid looks like the whole category, and a product awaiting review is
 * invisible to the person who has to review it. Deleted products are out of
 * the catalog (FR-ADM-22) and are restored from the admin product list.
 *
 * Each tile carries the action that puts it on the storefront: publish, which
 * explains itself where nothing prices the product.
 *
 * Only ever rendered inside a storefront `@defer (when editMode)` block, and
 * reaches the admin catalog client through `EDIT_MODE_CATALOG`, so its query
 * never runs for a visitor.
 */
@Component({
  selector: 'app-hidden-products-section',
  imports: [PricePipe, Button, Icon, StatusBadge, RouterLink, ErrorText],
  template: `
    @if (hidden.value(); as items) {
      @if (items.length) {
        <section class="mt-12 border-t border-edge pt-8">
          <h2 class="text-lg font-normal tracking-tight text-ink-subtle">
            {{ text.hiddenHeading }}
          </h2>
          <p class="mt-1 text-sm text-ink-subtle">{{ text.hiddenHint }}</p>
          <ul [class]="grid">
            @for (item of items; track item.slug) {
              <li class="h-full">
                <div [class]="card">
                  <div [class]="photoBox">
                    <div [class]="photo">
                      @if (item.images[0]; as image) {
                        <img
                          [src]="image.thumb"
                          [alt]="item.name"
                          class="size-full bg-white object-contain opacity-50
                                 grayscale"
                        />
                      }
                    </div>
                  </div>
                  <div [class]="body">
                    <p class="mb-1 flex flex-wrap gap-1">
                      <span appStatusBadge tone="waiting">{{
                        productStates.unpublished
                      }}</span>
                      <!-- The second reason, and the one the button below
                           cannot resolve: nothing prices this product. -->
                      @if (item.priceMinor === null) {
                        <span appStatusBadge tone="danger">{{
                          productStates.unpriced
                        }}</span>
                      }
                    </p>
                    <!-- The page an admin is shown even while it is hidden,
                         saying why (FR-ADM-06). -->
                    <h3
                      class="line-clamp-2 text-sm text-ink-subtle"
                      [title]="item.name"
                    >
                      <a
                        [routerLink]="['/product', item.slug]"
                        class="hover:text-accent"
                        >{{ item.name }}</a
                      >
                    </h3>
                    <p class="mt-auto pt-2 font-emphasis text-ink-subtle">
                      @if (item.priceMinor === null) {
                        {{ text.unpricedHint }}
                      } @else {
                        {{ item.priceMinor | price }}
                      }
                    </p>
                    <!-- Editing above the action that undoes the hiding: a
                         tile down here has no pencil of its own, and a product
                         nothing prices is fixed on the editor rather than by
                         the button below — which is exactly what it says when
                         pressed. Returns to this page, as every editor opened
                         from the storefront does. -->
                    <div class="mt-3 flex flex-col items-start gap-2">
                      <a
                        appButton
                        variant="secondary"
                        class="w-full gap-2"
                        [routerLink]="['/admin/products', item.slug, 'edit']"
                        [queryParams]="editorFrom()"
                      >
                        <app-icon [glyph]="pencilIcon" class="size-4" />
                        {{ text.editProduct }}
                      </a>
                      <button
                        appButton
                        variant="secondary"
                        type="button"
                        class="w-full gap-2"
                        [disabled]="busy() === item.slug"
                        [title]="cannotPublish(item) ? text.unpricedHint : null"
                        (click)="publish(item)"
                      >
                        <app-icon [glyph]="bookCheckIcon" class="size-4" />
                        {{ actionLabel(item) }}
                      </button>
                    </div>
                  </div>
                </div>
              </li>
            }
          </ul>
          @if (error()) {
            <p appErrorText class="mt-4" role="alert">{{ error() }}</p>
          }
        </section>
      }
    }
  `,
})
export class HiddenProductsSection {
  protected readonly bookCheckIcon = bookCheckIcon;
  protected readonly pencilIcon = pencilIcon;
  private readonly catalog = inject(EDIT_MODE_CATALOG);
  private readonly confirm = inject(ConfirmService);
  /** So the editor's cancel lands back on the page the tile was on. */
  protected readonly editorFrom = injectEditorReturnParams();
  protected readonly adminText = inject(ADMIN_TEXT);
  protected readonly text = inject(ADMIN_TEXT).editMode;
  protected readonly productStates = inject(ADMIN_TEXT).products;
  protected readonly actionText = inject(SHARED_TEXT).actions;

  readonly categorySlug = input.required<string>();
  /** Bump to force a re-fetch (e.g. after a delete elsewhere on the page). */
  readonly reloadToken = input(0);
  /** A product went onto the storefront, so the host reloads its grid. */
  readonly published = output<void>();
  /** Fires once the set has settled (loaded or errored). The host gates its
   * edit affordances on this so they and this overlay appear together. */
  readonly loaded = output<void>();

  /** The storefront listing's own grid, measured on the same container: these
   * tiles sit under that listing, and a grid of its own put them in two
   * columns while the products above them were already one to a line. */
  protected readonly grid = 'mt-5 ' + PRODUCT_GRID;

  /**
   * ProductTile's card, in the one state a hidden product is in: dashed and on
   * a tinted ground, which is what says the storefront is not showing it.
   * Below `LISTING_NARROW` it folds into a line exactly as the tile does — the
   * grid draws the rules between them, so the card drops its own frame.
   */
  protected readonly card =
    `flex h-full flex-col rounded-lg border border-dashed border-edge-strong
     bg-surface-subtle ` +
    `@max-[38rem]/listing:flex-row @max-[38rem]/listing:items-stretch
     @max-[38rem]/listing:gap-4 @max-[38rem]/listing:rounded-none
     @max-[38rem]/listing:border-0 @max-[38rem]/listing:bg-transparent ` +
    NARROW_PADDING_IN_GRID;

  protected readonly photoBox = 'relative flex ' + NARROW_PHOTO_IN_GRID;

  /** Flush with the card's top edge, and its own framed square once the card
   * has no frame to lend it — the tile's rule, and a row's at every width. */
  protected readonly photo = `block aspect-square w-full overflow-hidden
                              rounded-t-lg bg-white
                              @max-[38rem]/listing:rounded-md
                              @max-[38rem]/listing:ring-1
                              @max-[38rem]/listing:ring-edge`;

  protected readonly body =
    'flex flex-1 flex-col p-3 @max-[38rem]/listing:p-0 ' + NARROW_BODY_IN_GRID;

  protected readonly busy = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);

  protected readonly hidden = resource({
    params: () => ({ slug: this.categorySlug(), token: this.reloadToken() }),
    loader: async ({ params }) =>
      (await this.catalog()).listHiddenProducts(params.slug),
  });

  constructor() {
    effect(() => {
      if (this.hidden.hasValue() || this.hidden.error()) this.loaded.emit();
    });
  }

  /**
   * An unpriced product cannot be put on the storefront, and the server
   * refuses it. The button explains rather than disappearing.
   */
  protected cannotPublish(item: HiddenProduct): boolean {
    return item.priceMinor === null;
  }

  protected actionLabel(item: HiddenProduct): string {
    return this.busy() === item.slug
      ? this.actionText.saving
      : this.text.publishProduct;
  }

  protected async publish(item: HiddenProduct): Promise<void> {
    // Live but refusing on an unpriced product: the click is answered with the
    // reason, which a dead button cannot give.
    if (this.cannotPublish(item)) {
      await this.confirm.tell({
        heading: this.text.unpricedTitle,
        message: this.adminText.catalogErrors['product-has-no-price'],
        closeLabel: this.actionText.close,
      });
      return;
    }
    this.busy.set(item.slug);
    this.error.set(null);
    try {
      await (await this.catalog()).setProductPublished(item.slug, true);
      this.published.emit();
    } catch {
      this.error.set(this.text.revealError);
    } finally {
      this.busy.set(null);
    }
  }
}
