import { Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CatalogImage } from '@b2b-catalog-platform/shared';
import { BuyableProduct, ProductBuyControls } from './product-buy-controls';
import { TileGallery } from './tile-gallery';

/** The classes a list of product rows uses: hairlines between the lines, and
 * one above and below the run, so the list reads as a single block. */
export const PRODUCT_ROWS = 'divide-y divide-border border-y border-border';

/** What a row needs: the little that makes a product buyable, plus its photos. */
export interface RowProduct extends BuyableProduct {
  images: CatalogImage[];
}

/**
 * One product as a full-width line — the list counterpart of ProductTile
 * (FR-CAT-06), and the row the cart page is made of (FR-CART-02).
 *
 * The card and the line carry the same buying controls, turned on their side:
 * a customer who chose a unit in the grid finds the same three segments in the
 * same order here, and in the cart, where the line they already own is what
 * those controls are editing.
 *
 * Four slots, because what wraps a row differs by where it is: `rowSelect` for
 * a tick box in the leading column, `rowOverlay` for what acts on the product
 * itself — pinned to the photo's corner, where a card puts the same cluster —
 * `rowActions` for what may be done to the line, handed on to the end of the
 * price row, and the default slot for whatever belongs under the name: an
 * advisory, the cart's note field. The cart fills three of them; a listing in
 * edit mode fills the overlay.
 */
@Component({
  selector: 'app-product-row',
  imports: [RouterLink, TileGallery, ProductBuyControls],
  host: { class: 'block' },
  template: `
    <!-- Two containers, because the line is asked two different questions.
         Whether the page is narrow — the width at which a card and a line
         become the same drawing — is asked of the whole line, tick box and
         all, so a cart and a listing take the shape in the same drag of the
         window edge. -->
    <div class="@container/line relative flex items-start gap-4 py-4">
      <ng-content select="[rowSelect]" />

      <!-- How the photo and the controls arrange themselves *within* the
           line is asked of what is left after the tick box, which is the room
           they actually have: a cart line and a listing line of one width
           leave them different amounts of it.

           Measured on the line either way, never on the window — a listing
           beside a filter panel, or a cart beside its summary, is narrower
           than both. -->
      <div class="@container/row flex min-w-0 flex-1 items-start gap-4">
        <!-- Square either way. A thumbnail from the width where a line can
             hold one and still fit two columns of controls beside it; below
             that the line is the same drawing a card makes at that width, and
             the photo takes whatever the controls do not need.

             Its own stacking context, so anything pinned over it lands on the
             photo's corner rather than the line's — a row is wide, and a
             cluster in *its* corner sits on top of the controls. -->
        <div
          class="relative flex w-24 shrink-0 @max-[593px]/line:w-auto @max-[593px]/line:min-w-16 @max-[593px]/line:max-w-48 @max-[593px]/line:flex-1 @max-[593px]/line:shrink"
        >
          <app-tile-gallery
            class="block aspect-square w-full overflow-hidden rounded-md"
            [images]="item().images"
            [link]="link()"
            [productName]="item().name"
          />
          <ng-content select="[rowOverlay]" />
        </div>

        <!-- Name above the controls until the line is wide enough for all
             three columns side by side. The controls pair up well before
             that, so between the two widths the line reads as a title with
             the two columns underneath.

             Wide enough is three columns of 13rem and the gaps between them,
             which is what the name asks for as much as the controls do: a
             title squeezed into what two columns of controls left over is a
             title read four words to the line. -->
        <!-- A container of its own: what the controls have to lay themselves
             out in is this column, not the line — the name's own column comes
             off it first once there are three of them. -->
        <div
          class="@container/body flex min-w-0 flex-1 flex-col gap-2 @max-[593px]/line:min-w-52 @min-[49rem]/row:flex-row @min-[49rem]/row:items-start @min-[49rem]/row:gap-6"
        >
          <!-- As tall as the photo beside it once the two sit side by side, so
               what the caller projects last — the cart's note field — can drop
               to the photo's own bottom edge. A longer name pushes it down
               instead, which is the column growing rather than the note
               moving. -->
          <div
            class="flex min-w-0 flex-1 flex-col @min-[49rem]/row:min-h-24 @min-[49rem]/row:min-w-52"
          >
            <!-- A heading, as on a card: the same product listed two ways is
                 the same document outline either way, down to its size — a
                 line and a card that differed by nothing but their headings
                 were two drawings of one thing. -->
            <a [routerLink]="link()" class="group block">
              <h2
                class="text-sm text-stone-700 group-hover:text-accent"
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
          >
            <!-- Handed on to the price row, where it sits at the end of the line
                 that states what one costs — a corner, and the same corner a
                 card puts its note button in. -->
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
  readonly item = input.required<RowProduct>();
  /** False in a preview: the row is there to show what a visitor will see,
   * not to fill a manager's own cart. */
  readonly canAdd = input(true);
  /** False for a cart line the shop can no longer price — the controls state
   * no figure, and the row says why. */
  readonly available = input(true);
  /** True where the caller writes the note field itself — the cart, which
   * projects one under the name — so the controls do not also offer their
   * bubble. */
  readonly externalNote = input(false);

  protected readonly link = computed(() => ['/product', this.item().slug]);
}
