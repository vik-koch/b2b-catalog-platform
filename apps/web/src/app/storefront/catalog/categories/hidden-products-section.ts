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
import { HiddenProduct } from '@b2b-catalog-platform/shared/core/catalog';
import { Button } from '@b2b-catalog-platform/ui/actions/button';
import { StatusBadge } from '@b2b-catalog-platform/ui/content/status-badge';
import { ErrorText } from '@b2b-catalog-platform/ui/fields/error-text';
import { bookCheckIcon } from '@b2b-catalog-platform/ui/icons/glyphs/book-check';
import { pencilIcon } from '@b2b-catalog-platform/ui/icons/glyphs/pencil';
import { Icon } from '@b2b-catalog-platform/ui/icons/icon';
import { ConfirmService } from '@b2b-catalog-platform/ui/overlay/confirm.service';
import { EDIT_MODE_CATALOG } from '../../../core/catalog/edit-mode-catalog';
import { PricePipe } from '../../../core/catalog/pricing/price.pipe';
// eslint-disable-next-line no-restricted-imports -- until the texts are cut by area: edit mode is staff reading a storefront page
import { ADMIN_TEXT } from '../../../shared/config/admin-text';
import { SHARED_TEXT } from '../../../shared/config/shared-text';
import { injectEditorReturnParams } from '../../../shared/edit-mode/editor-return';
import {
  NARROW_BODY_IN_GRID,
  NARROW_PADDING_IN_GRID,
  NARROW_PHOTO_IN_GRID,
} from '../ui/listing-narrow';
import { PRODUCT_GRID } from '../ui/product-tile';

/**
 * The edit-mode overlay under a category grid (FR-ADM-06): its unpublished
 * products, which the grid does not show, each with the action that publishes
 * it. Rendered only inside `@defer (when editMode)`, so a visitor never runs
 * its query.
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
                      <span uiStatusBadge tone="waiting">{{
                        productStates.unpublished
                      }}</span>
                      @if (item.prices === null) {
                        <span uiStatusBadge tone="danger">{{
                          productStates.unpriced
                        }}</span>
                      }
                    </p>
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
                      @if (item.prices; as prices) {
                        {{ prices.piece | price }}
                      } @else {
                        {{ text.unpricedHint }}
                      }
                    </p>
                    <!-- No pencil on these tiles, and an unpriced product is
                         fixed in the editor, so editing comes first. -->
                    <div class="mt-3 flex flex-col items-start gap-2">
                      <a
                        uiButton
                        variant="secondary"
                        class="w-full gap-2"
                        [routerLink]="['/admin/products', item.slug, 'edit']"
                        [queryParams]="editorFrom()"
                      >
                        <ui-icon [glyph]="pencilIcon" class="size-4" />
                        {{ text.editProduct }}
                      </a>
                      <button
                        uiButton
                        variant="secondary"
                        type="button"
                        class="w-full gap-2"
                        [disabled]="busy() === item.slug"
                        [title]="cannotPublish(item) ? text.unpricedHint : null"
                        (click)="publish(item)"
                      >
                        <ui-icon [glyph]="bookCheckIcon" class="size-4" />
                        {{ actionLabel(item) }}
                      </button>
                    </div>
                  </div>
                </div>
              </li>
            }
          </ul>
          @if (error()) {
            <p uiErrorText class="mt-4" role="alert">{{ error() }}</p>
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
  protected readonly editorFrom = injectEditorReturnParams();
  private readonly adminText = inject(ADMIN_TEXT);
  protected readonly text = this.adminText.editMode;
  protected readonly productStates = this.adminText.products;
  protected readonly actionText = inject(SHARED_TEXT).actions;

  readonly categorySlug = input.required<string>();
  /** A product went onto the storefront: the host reloads its grid. */
  readonly published = output<void>();
  /** Loaded or failed: the host shows its edit affordances with this. */
  readonly loaded = output<void>();

  /** The listing's own grid, so these line up with the products above. */
  protected readonly grid = 'mt-5 ' + PRODUCT_GRID;

  /** ProductTile's card, dashed on a tinted ground: not on the storefront.
   * Below `LISTING_NARROW` it folds into a line as the tile does. */
  protected readonly card = `flex h-full flex-col rounded-lg border
                             border-dashed border-edge-strong
                             bg-surface-subtle ${NARROW_PADDING_IN_GRID}
                             @max-[38rem]/listing:flex-row
                             @max-[38rem]/listing:items-stretch
                             @max-[38rem]/listing:gap-4
                             @max-[38rem]/listing:rounded-none
                             @max-[38rem]/listing:border-0
                             @max-[38rem]/listing:bg-transparent`;

  protected readonly photoBox = 'relative flex ' + NARROW_PHOTO_IN_GRID;

  /** Its own framed square once the card has no frame, as on the tile. */
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
    params: () => this.categorySlug(),
    loader: async ({ params }) => (await this.catalog()).listHidden(params),
  });

  constructor() {
    effect(() => {
      if (this.hidden.hasValue() || this.hidden.error()) this.loaded.emit();
    });
  }

  protected cannotPublish(item: HiddenProduct): boolean {
    return item.prices === null;
  }

  protected actionLabel(item: HiddenProduct): string {
    return this.busy() === item.slug
      ? this.actionText.saving
      : this.text.publishProduct;
  }

  protected async publish(item: HiddenProduct): Promise<void> {
    // Answered with the reason, which a disabled button could not give.
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
      await (await this.catalog()).setPublished(item.slug, true);
      this.hidden.reload();
      this.published.emit();
    } catch {
      this.error.set(this.text.revealError);
    } finally {
      this.busy.set(null);
    }
  }
}
