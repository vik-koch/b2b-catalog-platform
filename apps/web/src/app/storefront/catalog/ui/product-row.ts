import { Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  ProductAvailability,
  ProductImage,
  ProductVariant,
} from '@b2b-catalog-platform/shared/core/catalog';
import { Frame } from '@b2b-catalog-platform/ui/content/frame';
import {
  BuyableProduct,
  ProductBuyControls,
} from '../../../core/catalog/buying/product-buy-controls';
import {
  NARROW_BODY_IN_LINE,
  NARROW_PADDING_IN_LINE,
  NARROW_PHOTO_IN_LINE,
} from './listing-narrow';
import { ProductStatusLine } from './product-status-line';
import { TileGallery } from './tile-gallery';

/** Hairlines between the lines and around the run. */
export const PRODUCT_ROWS = 'divide-y divide-edge border-y border-edge';

export interface RowProduct extends BuyableProduct {
  images: ProductImage[];
  variants: ProductVariant[];
  /** Null where stock is untracked, absent on a cart line. */
  availability?: ProductAvailability | null;
}

/**
 * A product as a full-width line (FR-CAT-06), also the cart's (FR-CART-02).
 * Slots: `rowSelect` leads with a tick box, `rowOverlay` pins to the photo's
 * corner, `rowActions` ends the price row, and the default slot sits under
 * the name.
 */
@Component({
  selector: 'app-product-row',
  imports: [
    RouterLink,
    TileGallery,
    ProductStatusLine,
    ProductBuyControls,
    Frame,
  ],
  // The host, since no element answers its own container query.
  host: { class: 'block @container/line' },
  template: `
    <!-- Narrowness is asked of the whole line, tick box and all, so cart
         and listing turn at one width. -->
    <div [class]="line">
      <ng-content select="[rowSelect]" />

      <!-- The arrangement inside is asked of what the tick box leaves. -->
      <div class="@container/row flex min-w-0 flex-1 items-start gap-4">
        <!-- What the controls' 28.5rem leave, up to 8.125rem, 6rem once the
             name stands beside them: the controls are never squeezed. Its
             own stacking context, so a pinned cluster lands on the photo. -->
        <div [class]="photoBox">
          <app-tile-gallery
            uiFrame
            [class]="photo"
            [images]="item().images"
            [link]="link()"
            [productName]="item().name"
            [labels]="false"
          />
          <ng-content select="[rowOverlay]" />
        </div>

        <!-- Three columns from 47.5rem, what three cards come to, so line and
             grid gain their third column at one width. -->
        <div [class]="bodyColumn">
          <!-- As tall as the photo, so the cart's note field drops to its
               bottom edge. -->
          <div
            class="flex min-w-0 flex-1 flex-col
                   @min-[47.5rem]/row:min-h-24 @min-[47.5rem]/row:min-w-44"
          >
            <app-product-status-line
              class="mb-1.5"
              [availability]="item().availability ?? null"
              [parts]="item().parts ?? []"
              [variants]="item().variants"
              [images]="item().images"
              [productName]="item().name"
            />
            <a [routerLink]="link()" class="group block">
              <h2
                class="text-sm text-ink group-hover:text-accent"
                [title]="item().name"
              >
                {{ item().name }}
              </h2>
            </a>
            <ng-content />
          </div>

          <app-product-buy-controls
            layout="row"
            [compact]="true"
            [item]="item()"
            [image]="item().images[0]"
            [canAdd]="canAdd()"
            [available]="available()"
            [externalNote]="externalNote()"
            [offerPairings]="offerPairings()"
            [notice]="notice()"
            [priceNote]="priceNote()"
          >
            <span priceAction class="flex">
              <ng-content select="[rowActions]" />
            </span>
          </app-product-buy-controls>
        </div>
      </div>
    </div>
  `,
})
export class ProductRow {
  protected readonly photo = `block aspect-square w-full overflow-hidden
                              rounded-md`;

  protected readonly line = `relative flex items-start gap-4 py-3
                             ${NARROW_PADDING_IN_LINE}`;

  protected readonly photoBox = `relative flex shrink-0
                                 w-[min(8.125rem,100%_-_29.5rem)]
                                 ${NARROW_PHOTO_IN_LINE}
                                 @min-[47.5rem]/row:w-24`;

  protected readonly bodyColumn = `@container/body flex min-w-0 flex-1
                                   flex-col gap-2 ${NARROW_BODY_IN_LINE}
                                   @min-[47.5rem]/row:flex-row
                                   @min-[47.5rem]/row:items-start
                                   @min-[47.5rem]/row:gap-4`;

  readonly item = input.required<RowProduct>();
  /** False in a preview, which must not fill a manager's own cart. */
  readonly canAdd = input(true);
  /** False for a cart line the shop can no longer price. */
  readonly available = input(true);
  /** The caller draws the note field itself, as the cart does. */
  readonly externalNote = input(false);
  /** Shown in the controls' bubble under the stepper. */
  readonly notice = input<string | null>(null);
  /** Under the price: the cart's rate where its lines differ. */
  readonly priceNote = input<string | null>(null);
  /** False where the caller shows the counterparts itself, and inside the
   * panel they open. */
  readonly offerPairings = input(true);

  protected readonly link = computed(() => ['/product', this.item().slug]);
}
