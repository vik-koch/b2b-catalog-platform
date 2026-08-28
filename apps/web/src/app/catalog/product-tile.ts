import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ProductListItem } from '@b2b-catalog-platform/shared';
import { ProductBuyControls } from './product-buy-controls';
import { ProductUnitFacts } from './product-unit-facts';
import { TileGallery } from './tile-gallery';

/**
 * The width below which a listing gives up on columns of any kind: one product
 * to a line, whichever layout the visitor chose.
 *
 * It is the app's one narrow threshold, and it is set where the rest of the
 * page already turns: 593px is what a window at the `sm` breakpoint (640px)
 * leaves once the frame's padding and a scrollbar come off, so the listing
 * takes its narrow shape in the same drag of the window edge that shrinks the
 * heading above it and drops the filter chips. Two thresholds a few dozen
 * pixels apart made one resize rearrange the page twice.
 *
 * A px figure rather than a round number of rem, because it is arithmetic and
 * exact to the pixel: `@max` is a strict comparison and `@min` is not, so the
 * two share one figure and partition on it. A viewport with no classic
 * scrollbar — a phone, a trackpad — turns a few pixels earlier than the
 * heading does; on one of those the window is far below either figure anyway.
 *
 * Comfortably above the floor, which is what a line needs to hold a thumbnail
 * and two columns of buying controls beside it — 6rem of photo, a 1rem gap and
 * the controls' own 27.5rem.
 *
 * Both layouts leave the shape at the same width, which is the point: below it
 * a card and a line are the same drawing, and above it each becomes itself.
 * Measured on the listing, not the window, so a listing beside the filter
 * panel counts its own width.
 */
export const LISTING_NARROW = '593px';

/**
 * The classes every grid of product cards uses.
 *
 * Columns are fitted, not counted: a card carries a price, a three-way unit
 * selector, a stepper and a button, and below about 234px those stop fitting
 * side by side. Fixed column counts kept breaking that promise at the widths in
 * between — a phone in landscape, or the moment the filter panel appears beside
 * the grid — so the track is `minmax(min(242px, 100%), 1fr)`: as many columns as
 * fit at that width and no narrower, down to one on a phone. The `min()` is what
 * keeps a container narrower than a card from overflowing sideways.
 *
 * 242px rather than the 234px the controls need, because the width where the
 * filter panel arrives is set by the *line* layout (`FACET_LAYOUT`), and at
 * that width a 234px card fits four columns without the panel and three with
 * it: widening the window would have taken a column away as the panel
 * appeared. Eight pixels more, and the count is the same on both sides of it.
 */
export const PRODUCT_GRID =
  'grid grid-cols-[repeat(auto-fill,minmax(min(15.125rem,100%),1fr))] gap-x-4 gap-y-8 @max-[593px]/listing:grid-cols-1 @max-[593px]/listing:gap-y-0 @max-[593px]/listing:divide-y @max-[593px]/listing:divide-border @max-[593px]/listing:border-y @max-[593px]/listing:border-border';

/**
 * The same grid at the card's true floor — 234px, what the buying controls
 * need side by side — for a listing that has no filter panel to share the row
 * with. It is the eight pixels back: at the page's full width they are the
 * difference between four columns and five, and the reason they were given up
 * (the panel taking a column away as the window widened past its threshold)
 * cannot arise where a panel is never rendered at any width.
 *
 * A category with no attributes and a search with no facets are exactly that
 * case, and they are the listings that most want the extra column: there is
 * nothing beside the grid to look at instead.
 */
export const PRODUCT_GRID_FULL =
  'grid grid-cols-[repeat(auto-fill,minmax(min(14.625rem,100%),1fr))] gap-x-4 gap-y-8 @max-[593px]/listing:grid-cols-1 @max-[593px]/listing:gap-y-0 @max-[593px]/listing:divide-y @max-[593px]/listing:divide-border @max-[593px]/listing:border-y @max-[593px]/listing:border-border';

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
 * have them supply their own, and they are absolutely positioned inside this
 * card's own stacking context, which is why the card owns `relative` and the
 * slot sits at its top.
 */
@Component({
  selector: 'app-product-tile',
  imports: [RouterLink, TileGallery, ProductBuyControls, ProductUnitFacts],
  host: { class: 'h-full' },
  template: `
    <div
      class="group relative flex h-full flex-col rounded-lg border border-border bg-white transition-shadow hover:shadow-md @max-[593px]/listing:flex-row @max-[593px]/listing:items-stretch @max-[593px]/listing:gap-4 @max-[593px]/listing:rounded-none @max-[593px]/listing:border-0 @max-[593px]/listing:bg-transparent @max-[593px]/listing:py-4 @max-[593px]/listing:hover:shadow-none"
    >
      <ng-content />
      <!-- The clipping lives here, not on the card: the card has to let the
           stepper's bubble hang below its edge. -->
      <app-tile-gallery
        class="block aspect-square overflow-hidden rounded-t-lg @max-[593px]/listing:w-auto @max-[593px]/listing:min-w-16 @max-[593px]/listing:max-w-48 @max-[593px]/listing:flex-1 @max-[593px]/listing:self-start @max-[593px]/listing:rounded-none"
        [images]="item().images"
        [link]="['/product', item().slug]"
        [productName]="item().name"
      />
      <!-- Grows to fill the tallest card in the row, so the buying controls
           below it sit on one line whatever the names above them do. -->
      <div
        class="flex flex-1 flex-col p-3 @max-[593px]/listing:min-w-52 @max-[593px]/listing:p-0"
      >
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
  readonly item = input.required<ProductListItem>();
}
