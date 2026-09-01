import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ProductListItem } from '@b2b-catalog-platform/shared';
import { ProductBuyControls } from './product-buy-controls';
import { ProductUnitFacts } from './product-unit-facts';
import { FRAME } from '../ui/frame';
import {
  NARROW_BODY_IN_GRID,
  NARROW_PADDING_IN_GRID,
  NARROW_PHOTO_IN_GRID,
} from './listing-narrow';
import { TileGallery } from './tile-gallery';

/**
 * The classes every grid of product cards uses.
 *
 * Columns are fitted, not counted: a card carries a price, a three-way unit
 * selector, a stepper and a button, and they need 13.5rem side by side. Fixed
 * column counts kept breaking that promise at the widths in between — a phone
 * in landscape, or the moment the filter panel appears beside the grid — so
 * the track is `minmax(min(15rem, 100%), 1fr)`: as many columns as fit at that
 * width and no narrower, down to one on a phone. The `min()` is what keeps a
 * container narrower than a card from overflowing sideways.
 *
 * 15rem is that 13.5rem plus the card's own `px-3` either side, and nothing
 * else: the frame is an inset ring rather than a border, so it costs the
 * content no width. With the 1.25rem gap, five tracks are exactly the page's
 * full width, and a filter panel is the first of the five — which is why the
 * track and the gap are read together and neither is a matter of taste.
 */
export const PRODUCT_GRID =
  'grid grid-cols-[repeat(auto-fill,minmax(min(15rem,100%),1fr))] gap-5 @max-[593px]/listing:grid-cols-1 @max-[593px]/listing:gap-y-0 @max-[593px]/listing:divide-y @max-[593px]/listing:divide-border @max-[593px]/listing:border-y @max-[593px]/listing:border-border';

/**
 * One product card in a grid (FR-CAT-04) — gallery, name, price — shared by the
 * category grid and the search results so the two cannot drift apart.
 *
 * Below `LISTING_NARROW` the grid is one column and there is only one sensible
 * shape for a listing, whichever layout the visitor chose: the card gives up
 * its frame, its ground and its reserved lines and puts the photo on the left,
 * which is what the row does at the same width — down to the size of the name.
 * The two layouts converge rather than one of them being switched off —
 * nothing is re-rendered, so there is no rearrangement after hydration and the
 * choice is still there when the window is wide again.
 *
 * Edit-mode controls are projected rather than built in: the two listings that
 * have them supply their own, and they are pinned inside the photo's box —
 * the corner a row puts the same cluster in.
 */
@Component({
  selector: 'app-product-tile',
  imports: [RouterLink, TileGallery, ProductBuyControls, ProductUnitFacts],
  host: { class: 'h-full' },
  template: `
    <div [class]="card">
      <!-- Its own stacking context, so what the caller pins over it lands on
           the photo's corner rather than the card's — which is the same corner
           at card width, and nowhere near it once the photo is a thumbnail on
           the left. A box around the photo rather than the card also keeps the
           projected cluster out of the card's own flex flow: an empty slot
           between the card edge and the photo still took a gap. -->
      <div [class]="photoBox">
        <!-- The clipping lives here, not on the card: the card has to let the
             stepper's bubble hang below its edge. -->
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
        <a [routerLink]="['/product', item().slug]" class="block">
          <h2
            class="line-clamp-2 text-sm text-stone-700 group-hover:text-accent"
            [title]="item().name"
          >
            {{ item().name }}
          </h2>
        </a>
        <!-- Buying, anchored to the card bottom so it lines up across tiles
             regardless of name length. The same controls the product page
             carries, at card size: the price of the selected unit, the unit,
             the quantity, then the two facts that qualify them. -->
        <app-product-buy-controls
          class="mt-auto pt-2"
          [item]="item()"
          [image]="item().images[0]"
          [compact]="true"
        >
          <!-- Two lines' worth of room whether or not there are two lines:
               a card a line shorter than its neighbour puts its stepper and
               its button somewhere else, and a grid of controls at different
               heights reads as broken. There is no neighbour in the narrow
               shape, so nothing is held open there. -->
          <app-product-unit-facts
            class="mt-2 @min-[593px]/listing:min-h-[2lh]"
            [packagingInfo]="item().packaging"
          />
        </app-product-buy-controls>
      </div>
    </div>
  `,
})
export class ProductTile {
  /** The card's own hairline, which is also the frame around the photo at its
   * top — the photo is flush with three of the card's edges. Dropped in the
   * narrow shape, where the card is a line with nothing drawn around it. */
  protected readonly card =
    'group relative flex h-full flex-col rounded-lg bg-white transition-shadow hover:shadow-md ' +
    FRAME +
    ' @max-[593px]/listing:flex-row @max-[593px]/listing:items-stretch @max-[593px]/listing:gap-4 @max-[593px]/listing:rounded-none @max-[593px]/listing:ring-0 @max-[593px]/listing:bg-transparent @max-[593px]/listing:hover:shadow-none ' +
    NARROW_PADDING_IN_GRID;

  protected readonly photoBox = 'relative flex ' + NARROW_PHOTO_IN_GRID;

  /** Flush with three of the card's edges, so the card's own frame is the
   * photo's. In the narrow shape the card has no frame to lend it, and the
   * photo takes the one a line's photo carries at every width. */
  protected readonly photo =
    'block aspect-square w-full overflow-hidden rounded-t-lg @max-[593px]/listing:rounded-md @max-[593px]/listing:ring-1 @max-[593px]/listing:ring-border';

  protected readonly body =
    'flex flex-1 flex-col px-3 py-3 @max-[593px]/listing:p-0 ' +
    NARROW_BODY_IN_GRID;

  readonly item = input.required<ProductListItem>();
}
