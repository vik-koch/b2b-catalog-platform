import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ProductListItem } from '@b2b-catalog-platform/shared';
import { FRAME } from '../ui/frame';
import {
  NARROW_BODY_IN_GRID,
  NARROW_PADDING_IN_GRID,
  NARROW_PHOTO_IN_GRID,
} from './listing-narrow';
import { ProductAvailabilityBadge } from './product-availability-badge';
import { ProductBuyControls } from './product-buy-controls';
import { ProductUnitFacts } from './product-unit-facts';
import { TileGallery } from './tile-gallery';

/**
 * The classes every grid of product cards uses.
 *
 * Columns are fitted, not counted: a card needs 13.5rem for its price, unit
 * selector, stepper and button side by side, and fixed column counts broke
 * that at the widths in between — a phone in landscape, or the moment the
 * filter panel arrives beside the grid. 15rem is that plus the card's `px-3`;
 * the `min()` keeps a container narrower than a card from overflowing. With
 * the 1.25rem gap, five tracks are exactly the page width and the filter panel
 * is the first of the five, so track and gap are read together.
 */
export const PRODUCT_GRID =
  'grid grid-cols-[repeat(auto-fill,minmax(min(15rem,100%),1fr))] gap-5 @max-[38rem]/listing:grid-cols-1 @max-[38rem]/listing:gap-y-0 @max-[38rem]/listing:divide-y @max-[38rem]/listing:divide-border @max-[38rem]/listing:border-y @max-[38rem]/listing:border-border';

/**
 * One product card in a grid (FR-CAT-04) — gallery, name, price — shared by the
 * category grid and the search results.
 *
 * Below `LISTING_NARROW` the card gives up its frame, its ground and its
 * reserved lines and puts the photo on the left, which is what a row does at
 * the same width. The two converge in CSS rather than one being switched off:
 * nothing is re-rendered, so there is no rearrangement after hydration and the
 * choice survives the window widening again.
 *
 * Edit-mode controls are projected, and pinned inside the photo's box — the
 * corner a row puts the same cluster in.
 */
@Component({
  selector: 'app-product-tile',
  imports: [
    RouterLink,
    TileGallery,
    ProductAvailabilityBadge,
    ProductBuyControls,
    ProductUnitFacts,
  ],
  host: { class: 'h-full' },
  template: `
    <div [class]="card">
      <!-- Its own stacking context, so what the caller pins lands on the
           photo's corner rather than the card's — nowhere near it once the
           photo is a thumbnail on the left. It also keeps the projected
           cluster out of the card's flex flow, where an empty slot still took
           a gap. -->
      <div [class]="photoBox">
        <!-- The clipping lives here, not on the card: the card has to let
             the stepper's bubble hang below its edge. -->
        <app-tile-gallery
          [class]="photo"
          [images]="item().images"
          [link]="['/product', item().slug]"
          [productName]="item().name"
        />
        <ng-content />
      </div>
      <!-- Grows to fill the tallest card in the row, so the buying controls
           below it sit on one line whatever the names above them do. -->
      <div [class]="body">
        <!-- Over the name, where the eye lands before it reads: whether the
             thing can be had at all outranks what it is called. -->
        <app-product-availability-badge
          class="mb-1.5"
          [availability]="item().availability"
          [reserve]="reserveAvailability()"
        />
        <a [routerLink]="['/product', item().slug]" class="block">
          <h2
            class="line-clamp-2 text-sm text-stone-700 group-hover:text-accent"
            [title]="item().name"
          >
            {{ item().name }}
          </h2>
        </a>
        <!-- Anchored to the card bottom so it lines up across tiles whatever
             the names do. The controls the product page carries, at card
             size. -->
        <app-product-buy-controls
          class="mt-auto pt-2"
          [item]="item()"
          [image]="item().images[0]"
          [compact]="true"
        >
          <!-- Two lines' worth of room whether or not there are two lines: a
               card a line shorter than its neighbour puts its button
               somewhere else. There is no neighbour in the narrow shape. -->
          <app-product-unit-facts
            class="mt-2 @min-[38rem]/listing:min-h-[2lh]"
            [packagingInfo]="item().packaging"
          />
        </app-product-buy-controls>
      </div>
    </div>
  `,
})
export class ProductTile {
  /** The card's hairline, which is also the photo's: the photo is flush with
   * three of the card's edges. Dropped in the narrow shape, where the card is
   * a line with nothing drawn around it. */
  protected readonly card =
    'group relative flex h-full flex-col rounded-lg bg-white transition-shadow hover:shadow-md ' +
    FRAME +
    ' @max-[38rem]/listing:flex-row @max-[38rem]/listing:items-stretch @max-[38rem]/listing:gap-4 @max-[38rem]/listing:rounded-none @max-[38rem]/listing:ring-0 @max-[38rem]/listing:bg-transparent @max-[38rem]/listing:hover:shadow-none ' +
    NARROW_PADDING_IN_GRID;

  protected readonly photoBox = 'relative flex ' + NARROW_PHOTO_IN_GRID;

  /** With no card frame to borrow in the narrow shape, the photo takes the
   * one a line's photo carries at every width. */
  protected readonly photo =
    'block aspect-square w-full overflow-hidden rounded-t-lg @max-[38rem]/listing:rounded-md @max-[38rem]/listing:ring-1 @max-[38rem]/listing:ring-border';

  protected readonly body =
    'flex flex-1 flex-col px-3 py-3 @max-[38rem]/listing:p-0 ' +
    NARROW_BODY_IN_GRID;

  readonly item = input.required<ProductListItem>();
  /** True where some product in this listing has a state, so every card leaves
   * the line and the names sit level. */
  readonly reserveAvailability = input(false);
}
