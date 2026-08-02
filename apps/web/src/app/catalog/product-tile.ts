import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ProductListItem } from '@b2b-catalog-platform/shared';
import { PricePipe } from './price.pipe';
import { TileGallery } from './tile-gallery';

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
  imports: [RouterLink, PricePipe, TileGallery],
  host: { class: 'h-full' },
  template: `
    <div
      class="group relative flex h-full flex-col overflow-hidden rounded-lg border border-border bg-white transition-shadow hover:shadow-md"
    >
      <ng-content />
      <app-tile-gallery
        [images]="item().images"
        [link]="['/product', item().slug]"
        [productName]="item().name"
      />
      <div class="flex flex-1 flex-col p-3">
        <a [routerLink]="['/product', item().slug]" class="block">
          <h2
            class="line-clamp-2 text-sm text-stone-700 group-hover:text-accent"
            [title]="item().name"
          >
            {{ item().name }}
          </h2>
        </a>
        <!-- Price anchored to the card bottom so it lines up across tiles
             regardless of name length; future stock / add-to-cart sit beneath. -->
        <p class="mt-auto pt-2 font-bold text-primary">
          {{ item().priceMinor | price }}
        </p>
      </div>
    </div>
  `,
})
export class ProductTile {
  readonly item = input.required<ProductListItem>();
}
