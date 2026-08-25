import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ProductListItem } from '@b2b-catalog-platform/shared';
import { ProductBuyControls } from './product-buy-controls';
import { ProductUnitFacts } from './product-unit-facts';
import { TileGallery } from './tile-gallery';

/**
 * The classes every grid of product cards uses.
 *
 * Columns are fitted, not counted: a card carries a price, a three-way unit
 * selector, a stepper and a button, and below about 234px those stop fitting
 * side by side. Fixed column counts kept breaking that promise at the widths in
 * between — a phone in landscape, or the moment the filter panel appears beside
 * the grid — so the track is `minmax(min(234px, 100%), 1fr)`: as many columns as
 * fit at that width and no narrower, down to one on a phone. The `min()` is what
 * keeps a container narrower than a card from overflowing sideways.
 */
export const PRODUCT_GRID =
  'grid grid-cols-[repeat(auto-fill,minmax(min(14.625rem,100%),1fr))] gap-x-4 gap-y-8';

/**
 * One product card in a grid (FR-CAT-04) — gallery, name, price — shared by the
 * category grid and the search results so the two cannot drift apart.
 *
 * Edit-mode controls are projected rather than built in: only the category grid
 * has them, and they are absolutely positioned inside this card's own stacking
 * context, which is why the card owns `relative` and the slot sits at its top.
 */
@Component({
  selector: 'app-product-tile',
  imports: [RouterLink, TileGallery, ProductBuyControls, ProductUnitFacts],
  host: { class: 'h-full' },
  template: `
    <div
      class="group relative flex h-full flex-col rounded-lg border border-border bg-white transition-shadow hover:shadow-md"
    >
      <ng-content />
      <!-- The clipping lives here, not on the card: the card has to let the
           stepper's bubble hang below its edge. -->
      <app-tile-gallery
        class="block overflow-hidden rounded-t-lg"
        [images]="item().images"
        [link]="['/product', item().slug]"
        [productName]="item().name"
      />
      <!-- Grows to fill the tallest card in the row, so the buying controls
           below it sit on one line whatever the names above them do. -->
      <div class="flex flex-1 flex-col p-3">
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
          [compact]="true"
        >
          <app-product-unit-facts
            class="mt-2"
            [packagingInfo]="item().packaging"
            [reserve]="true"
          />
        </app-product-buy-controls>
      </div>
    </div>
  `,
})
export class ProductTile {
  readonly item = input.required<ProductListItem>();
}
