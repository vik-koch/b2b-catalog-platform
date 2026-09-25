import { Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ProductListItem } from '@b2b-catalog-platform/shared';
import { FRAME } from '../ui/frame';
import {
  NARROW_BODY_IN_GRID,
  NARROW_PADDING_IN_GRID,
  NARROW_PHOTO_IN_GRID,
} from './listing-narrow';
import { ProductBuyControls } from './product-buy-controls';
import { ProductStatusLine } from './product-status-line';
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
    ProductStatusLine,
    ProductBuyControls,
    ProductUnitFacts,
  ],
  host: { class: 'h-full' },
  template: `
    <div [class]="compact() ? compactCard : card">
      <!-- Its own stacking context, so what the caller pins lands on the
           photo's corner rather than the card's — nowhere near it once the
           photo is a thumbnail on the left. It also keeps the projected
           cluster out of the card's flex flow, where an empty slot still took
           a gap. -->
      <div [class]="compact() ? compactPhotoBox : photoBox">
        <!-- The clipping lives here, not on the card: the card has to let
             the stepper's bubble hang below its edge. -->
        <app-tile-gallery
          [class]="compact() ? compactPhoto : photo"
          [images]="item().images"
          [link]="['/product', item().slug]"
          [productName]="item().name"
        />
        <ng-content />
      </div>
      <!-- Grows to fill the tallest card in the row, so the buying controls
           below it sit on one line whatever the names above them do. -->
      <!-- In the compact shape the body steps aside ('contents'), so its
           three children take the card's grid: the badges beside the photo,
           the name and the controls under both. -->
      <div [class]="compact() ? 'contents' : body">
        <!-- Over the name, where the eye lands before it reads: whether the
             thing can be had at all outranks what it is called. -->
        <!-- The two badges at the card's two edges: the stock state where
             the eye enters, the set marker out of its way. -->
        <app-product-status-line
          [class]="compact() ? '' : 'mb-1.5 justify-between'"
          [stacked]="compact()"
          [availability]="item().availability"
          [parts]="item().parts"
          [reserve]="reserveStatus() && !compact()"
        />
        <!-- The card is not the link — the photo and the name are, and the
             buying controls in between are neither. So the name lights on its
             own hover, not the card's: lighting it from anywhere on the card
             promised a click that only lands on these two lines. -->
        <a
          [routerLink]="['/product', item().slug]"
          [class]="compact() ? 'col-span-2 mt-3 block' : 'block'"
        >
          <h2
            class="line-clamp-2 text-sm text-stone-700 transition-colors hover:text-accent"
            [title]="item().name"
          >
            {{ item().name }}
          </h2>
        </a>
        <!-- Anchored to the card bottom so it lines up across tiles whatever
             the names do. The controls the product page carries, at card
             size. -->
        <app-product-buy-controls
          [class]="compact() ? 'col-span-2 self-end pt-2' : 'mt-auto pt-2'"
          [item]="item()"
          [image]="item().images[0]"
          [compact]="true"
        >
          @if (!compact()) {
            <!-- Two lines' worth of room whether or not there are two lines: a
               card a line shorter than its neighbour puts its button
               somewhere else. There is no neighbour in the narrow shape. -->
            <app-product-unit-facts
              [class]="unitFacts()"
              [packagingInfo]="item().packaging"
            />
          }
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
  /**
   * The small card of the main page's row (FR-CAT-09): a thumbnail with the
   * badges beside it instead of a photo across the top, a fixed width, and
   * no narrow shape — it stands in a row that scrolls rather than narrows, so
   * there is no listing around it to ask. The two lines the unit facts hold
   * open are granted here for the same reason.
   */
  readonly compact = input(false);
  protected readonly unitFacts = computed(() =>
    this.compact()
      ? 'mt-2 min-h-[2lh]'
      : 'mt-2 @min-[38rem]/listing:min-h-[2lh]',
  );

  /** Two columns, the thumbnail's and the badges'; the name and the controls
   * span both. The last row takes what is left of the card, so the controls
   * sit on one line across the row whatever the names above them do. */
  protected readonly compactCard =
    'group relative grid h-full grid-cols-[6rem_1fr] grid-rows-[auto_auto_1fr] gap-x-3 rounded-lg bg-white p-3 transition-shadow hover:shadow-md ' +
    FRAME;
  protected readonly compactPhotoBox = 'relative flex size-24';
  protected readonly compactPhoto = `block aspect-square w-full overflow-hidden rounded-md ${FRAME}`;

  /** True where some product in this listing has a badge over its name, so
   * every card leaves the line and the names sit level. */
  readonly reserveStatus = input(false);
}
