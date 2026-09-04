import {
  Component,
  effect,
  inject,
  input,
  output,
  resource,
  signal,
} from '@angular/core';
import { HiddenProduct } from '@b2b-catalog-platform/shared';
import { ADMIN_TEXT } from '../../config/admin-text';
import { PricePipe } from '../../catalog/price.pipe';
import { PRODUCT_GRID } from '../../catalog/product-tile';
import {
  NARROW_BODY_IN_GRID,
  NARROW_PADDING_IN_GRID,
  NARROW_PHOTO_IN_GRID,
} from '../../catalog/listing-narrow';
import { Button } from '../../ui/button';
import { AdminIcon } from '../../ui/icons/admin-icon';
import { AdminCatalogService } from '../admin-catalog.service';
import { StatusBadge } from '../../ui/status-badge';

/**
 * The edit-mode overlay under a category grid (FR-ADM-01/06): what this category
 * holds that the storefront does not show — soft-deleted, unpublished, or both.
 * Without it the grid looks like the whole category, and a product awaiting
 * review is invisible to the person who has to review it.
 *
 * Each tile carries why it is hidden and the one action that undoes that
 * reason — restore for a deleted product, publish for an unpublished one. A
 * product that is both needs both, so its action is whichever it still has.
 *
 * Owns `AdminCatalogService` and is only ever rendered inside a storefront
 * `@defer (when editMode)` block, so the admin write client stays out of the
 * public bundle; its query never runs for a visitor.
 */
@Component({
  selector: 'app-hidden-products-section',
  imports: [PricePipe, Button, AdminIcon, StatusBadge],
  template: `
    @if (hidden.value(); as items) {
      @if (items.length) {
        <section class="mt-12 border-t border-border pt-8">
          <h2 class="text-lg font-normal tracking-tight text-subtle">
            {{ text.hiddenHeading }}
          </h2>
          <p class="mt-1 text-sm text-subtle">{{ text.hiddenHint }}</p>
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
                          class="h-full w-full object-cover opacity-50 grayscale"
                        />
                      }
                    </div>
                  </div>
                  <div [class]="body">
                    <!-- Both reasons where both apply: the tile has to say why
                         one action will not be enough to bring it back. -->
                    <p class="mb-1 flex flex-wrap gap-1">
                      @if (item.deleted) {
                        <span appStatusBadge>{{ text.deletedBadge }}</span>
                      }
                      @if (item.unpublished) {
                        <span appStatusBadge tone="waiting">{{
                          text.unpublishedBadge
                        }}</span>
                      }
                    </p>
                    <h3
                      class="line-clamp-2 text-sm text-subtle"
                      [title]="item.name"
                    >
                      {{ item.name }}
                    </h3>
                    <p class="mt-auto pt-2 font-emphasis text-stone-400">
                      {{ item.priceMinor | price }}
                    </p>
                    <button
                      appButton
                      variant="secondary"
                      type="button"
                      class="mt-3 gap-2"
                      [disabled]="busy() === item.slug"
                      (click)="reveal(item)"
                    >
                      <app-admin-icon
                        [name]="item.deleted ? 'rotate-ccw' : 'circle-check'"
                        class="h-4 w-4"
                      />
                      {{ actionLabel(item) }}
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
export class HiddenProductsSection {
  private readonly admin = inject(AdminCatalogService);
  protected readonly common = inject(ADMIN_TEXT).common;
  protected readonly text = inject(ADMIN_TEXT).editMode;

  readonly categorySlug = input.required<string>();
  /** Bump to force a re-fetch (e.g. after a delete elsewhere on the page). */
  readonly reloadToken = input(0);
  /** A product came back onto the storefront, so the host reloads its grid. */
  readonly restored = output<void>();
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
    'flex h-full flex-col rounded-lg border border-dashed border-border-strong bg-stone-50 ' +
    '@max-[38rem]/listing:flex-row @max-[38rem]/listing:items-stretch @max-[38rem]/listing:gap-4 @max-[38rem]/listing:rounded-none @max-[38rem]/listing:border-0 @max-[38rem]/listing:bg-transparent ' +
    NARROW_PADDING_IN_GRID;

  protected readonly photoBox = 'relative flex ' + NARROW_PHOTO_IN_GRID;

  /** Flush with the card's top edge, and its own framed square once the card
   * has no frame to lend it — the tile's rule, and a row's at every width. */
  protected readonly photo =
    'block aspect-square w-full overflow-hidden rounded-t-lg bg-stone-100 @max-[38rem]/listing:rounded-md @max-[38rem]/listing:ring-1 @max-[38rem]/listing:ring-border';

  protected readonly body =
    'flex flex-1 flex-col p-3 @max-[38rem]/listing:p-0 ' + NARROW_BODY_IN_GRID;

  protected readonly busy = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);

  protected readonly hidden = resource({
    params: () => ({ slug: this.categorySlug(), token: this.reloadToken() }),
    loader: ({ params }) => this.admin.listHiddenProducts(params.slug),
  });

  constructor() {
    effect(() => {
      if (this.hidden.hasValue() || this.hidden.error()) this.loaded.emit();
    });
  }

  /** Restore comes first: a deleted product is not a candidate for publishing
   * until it exists again. */
  protected actionLabel(item: HiddenProduct): string {
    if (this.busy() === item.slug) return this.common.saving;
    return item.deleted ? this.common.restore : this.text.publishProduct;
  }

  protected async reveal(item: HiddenProduct): Promise<void> {
    this.busy.set(item.slug);
    this.error.set(null);
    try {
      if (item.deleted) {
        await this.admin.restoreProduct(item.slug);
      } else {
        await this.admin.setProductPublished(item.slug, true);
      }
      this.restored.emit();
    } catch {
      this.error.set(this.text.revealError);
    } finally {
      this.busy.set(null);
    }
  }
}
