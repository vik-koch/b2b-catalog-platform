import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ProductListItem } from '@b2b-catalog-platform/shared/core/catalog';
import { Frame } from '@b2b-catalog-platform/ui/content/frame';
import { ProductBuyControls } from '../../../core/catalog/buying/product-buy-controls';
import { ProductUnitFacts } from '../../../core/catalog/buying/product-unit-facts';
import {
  NARROW_BODY_IN_GRID,
  NARROW_PADDING_IN_GRID,
  NARROW_PHOTO_IN_GRID,
} from './listing-narrow';
import { ProductStatusLine } from './product-status-line';
import { ImagePriority, TileGallery } from './tile-gallery';

/** Fitted 15rem tracks: the 13.5rem a card's controls need plus its `px-3`.
 * With the 1.25rem gap five fill the page, the filter panel being the first. */
export const PRODUCT_GRID = `grid
                             grid-cols-[repeat(auto-fill,minmax(min(15rem,100%),1fr))]
                             gap-5
                             @max-[38rem]/listing:grid-cols-1
                             @max-[38rem]/listing:gap-y-0
                             @max-[38rem]/listing:divide-y
                             @max-[38rem]/listing:divide-edge
                             @max-[38rem]/listing:border-y
                             @max-[38rem]/listing:border-edge`;

/** A product card (FR-CAT-04). Below `LISTING_NARROW` it turns into a row in
 * CSS alone, so nothing re-renders after hydration. Projected edit controls
 * pin to the photo's corner, as on a row. */
@Component({
  selector: 'app-product-tile',
  imports: [
    RouterLink,
    TileGallery,
    ProductStatusLine,
    ProductBuyControls,
    ProductUnitFacts,
    Frame,
  ],
  host: { class: 'h-full' },
  template: `
    <div uiFrame [class]="card">
      <!-- Its own stacking context, so a pinned cluster lands on the photo's
           corner and stays out of the card's flex flow. -->
      <div [class]="inset() ? insetPhotoBox : photoBox">
        <!-- Clipped here, not on the card: the stepper's bubble hangs below
             its edge. -->
        <app-tile-gallery
          [class]="inset() ? insetPhoto : photo"
          [images]="item().images"
          [link]="['/product', item().slug]"
          [productName]="item().name"
          [labelsOutside]="inset()"
          [priority]="imagePriority()"
        />
        <ng-content />
      </div>
      <div [class]="body">
        <app-product-status-line
          class="mb-1.5 justify-between"
          [availability]="item().availability"
          [parts]="item().parts"
          [reserve]="reserveStatus()"
        />
        <!-- Lit on its own hover: the card as a whole is not a link. -->
        <a [routerLink]="['/product', item().slug]" class="block">
          <h2
            class="line-clamp-2 text-sm text-ink transition-colors
                   hover:text-accent"
            [title]="item().name"
          >
            {{ item().name }}
          </h2>
        </a>
        <app-product-buy-controls
          class="mt-auto pt-2"
          [item]="item()"
          [image]="item().images[0]"
          [compact]="true"
        >
          @if (!inset()) {
            <!-- Two lines either way, so buttons line up across cards. -->
            <app-product-unit-facts
              class="mt-2 @min-[38rem]/listing:min-h-[2lh]"
              [packagingInfo]="item().packaging"
            />
          }
        </app-product-buy-controls>
      </div>
    </div>
  `,
})
export class ProductTile {
  /** The frame is the photo's too, flush with three of its edges. */
  protected readonly card = `group relative flex h-full flex-col rounded-lg
                             bg-white transition-shadow
                             ${NARROW_PADDING_IN_GRID}
                             hover:shadow-md
                             @max-[38rem]/listing:flex-row
                             @max-[38rem]/listing:items-stretch
                             @max-[38rem]/listing:gap-4
                             @max-[38rem]/listing:rounded-none
                             @max-[38rem]/listing:ring-0
                             @max-[38rem]/listing:bg-transparent
                             @max-[38rem]/listing:hover:shadow-none`;

  protected readonly photoBox = 'relative flex ' + NARROW_PHOTO_IN_GRID;

  /** Its own frame in the narrow shape, as a line's photo has. */
  protected readonly photo = `block aspect-square w-full overflow-hidden
                              rounded-t-lg
                              @max-[38rem]/listing:rounded-md
                              @max-[38rem]/listing:ring-1
                              @max-[38rem]/listing:ring-edge`;

  protected readonly body = `flex flex-1 flex-col p-3 ${NARROW_BODY_IN_GRID}
                             @max-[38rem]/listing:p-0`;

  readonly item = input.required<ProductListItem>();
  /** The main page's row (FR-CAT-09): the photo inside the padding, no
   * packaging facts. Never narrow: the row scrolls. */
  readonly inset = input(false);

  protected readonly insetPhotoBox = 'relative m-3 mb-0 flex';
  /** Unclipped, so a variant's label can reach the card's edge. */
  protected readonly insetPhoto = 'block aspect-square w-full rounded-md';

  readonly reserveStatus = input(false);

  readonly imagePriority = input<ImagePriority>('lazy');
}
