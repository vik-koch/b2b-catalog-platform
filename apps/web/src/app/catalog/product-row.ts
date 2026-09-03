import { Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  CatalogImage,
  ProductAvailability,
} from '@b2b-catalog-platform/shared';
import { FRAME } from '../ui/frame';
import {
  NARROW_BODY_IN_LINE,
  NARROW_PADDING_IN_LINE,
  NARROW_PHOTO_IN_LINE,
} from './listing-narrow';
import { ProductAvailabilityBadge } from './product-availability-badge';
import { BuyableProduct, ProductBuyControls } from './product-buy-controls';
import { TileGallery } from './tile-gallery';

/** The classes a list of product rows uses: hairlines between the lines, and
 * one above and below the run, so the list reads as a single block. */
export const PRODUCT_ROWS = 'divide-y divide-border border-y border-border';

/** What a row needs: the little that makes a product buyable, plus its photos. */
export interface RowProduct extends BuyableProduct {
  images: CatalogImage[];
  /** Null where stock is untracked, and null for a cart line, whose product
   * shape does not carry one. */
  availability?: ProductAvailability | null;
}

/**
 * One product as a full-width line — the list counterpart of ProductTile
 * (FR-CAT-06), and the row the cart page is made of (FR-CART-02).
 *
 * The card and the line carry the same buying controls, turned on their side,
 * so a customer who chose a unit in the grid finds the same three segments in
 * the same order here and in the cart.
 *
 * Four slots, because what wraps a row differs by where it is: `rowSelect` for
 * a tick box in the leading column, `rowOverlay` for what acts on the product
 * itself — pinned to the photo's corner, where a card puts the same cluster —
 * `rowActions` for what may be done to the line, handed to the end of the
 * price row, and the default slot for what belongs under the name: an
 * advisory, the cart's note field. The cart fills three; a listing in edit
 * mode fills the overlay.
 */
@Component({
  selector: 'app-product-row',
  imports: [
    RouterLink,
    TileGallery,
    ProductAvailabilityBadge,
    ProductBuyControls,
  ],
  // The narrow container is the host rather than the line inside it: the line
  // asks it what room to leave, and no element can answer its own container
  // query. Same width either way — the line fills the host.
  host: { class: 'block @container/line' },
  template: `
    <!-- Two containers, because the line is asked two different questions.
         Whether the page is narrow is asked of the whole line, tick box and
         all, so a cart and a listing take the shape at one width. -->
    <div [class]="line">
      <ng-content select="[rowSelect]" />

      <!-- How the photo and the controls arrange themselves *within* the line
           is asked of what is left after the tick box, which is the room they
           actually have. Never of the window: a listing beside a filter panel,
           or a cart beside its summary, is narrower than both. -->
      <div class="@container/row flex min-w-0 flex-1 items-start gap-4">
        <!-- Square either way, and worth what stands beside it: whatever is
             left once the controls have their 28.5rem, up to 7.75rem while
             the name sits above them and 6rem once it moves beside them.

             Left over rather than stepped, so the controls can never be
             squeezed by it and the photo never drops 40px as the window
             widens.

             Its own stacking context, so anything pinned over it lands on the
             photo's corner rather than the line's — a row is wide, and a
             cluster in *its* corner sits on the controls. -->
        <div [class]="photoBox">
          <app-tile-gallery
            [class]="photo"
            [images]="item().images"
            [link]="link()"
            [productName]="item().name"
          />
          <ng-content select="[rowOverlay]" />
        </div>

        <!-- Name above the controls until the line is wide enough for all
             three columns side by side: 47.5rem, the two 13.5rem columns plus
             11rem for the name, the photo and a 1rem seam each. That is what
             three cards come to, so a line and a grid take their third column
             at one width and the filter panel can arrive beside either.

             A container of its own, because what the controls lay themselves
             out in is this column, not the line — the name's column comes off
             it first once there are three. -->
        <div [class]="bodyColumn">
          <!-- As tall as the photo beside it, so what the caller projects last
               — the cart's note field — drops to the photo's bottom edge. A
               longer name pushes it down instead. -->
          <div
            class="flex min-w-0 flex-1 flex-col @min-[47.5rem]/row:min-h-24 @min-[47.5rem]/row:min-w-44"
          >
            <!-- Over the name, as on a card: the same fact in the same place
                 whichever way the listing is drawn. -->
            <app-product-availability-badge
              class="mb-1"
              [availability]="item().availability ?? null"
            />
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
            [notice]="notice()"
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
  /** The frame is on the gallery itself, which is what clips the photo. */
  protected readonly photo = `block aspect-square w-full overflow-hidden rounded-md ${FRAME}`;

  /** Roomier in the narrow shape, where there is no frame around a product to
   * say where one ends and the next begins. */
  protected readonly line =
    'relative flex items-start gap-4 py-3 ' + NARROW_PADDING_IN_LINE;

  protected readonly photoBox =
    'relative flex w-[min(7.75rem,100%_-_29.5rem)] shrink-0 @min-[47.5rem]/row:w-24 ' +
    NARROW_PHOTO_IN_LINE;

  protected readonly bodyColumn =
    '@container/body flex min-w-0 flex-1 flex-col gap-2 @min-[47.5rem]/row:flex-row @min-[47.5rem]/row:items-start @min-[47.5rem]/row:gap-4 ' +
    NARROW_BODY_IN_LINE;

  readonly item = input.required<RowProduct>();
  /** False in a preview: the row is there to show what a visitor will see,
   * not to fill a manager's own cart. */
  readonly canAdd = input(true);
  /** False for a cart line the shop can no longer price — the controls state
   * no figure and take no input, and the row says why. */
  readonly available = input(true);
  /** True where the caller writes the note field itself — the cart, which
   * projects one under the name — so the controls do not also offer their
   * bubble. */
  readonly externalNote = input(false);
  /** Something to say about this line, shown in the controls' own bubble under
   * the stepper it is about. */
  readonly notice = input<string | null>(null);

  protected readonly link = computed(() => ['/product', this.item().slug]);
}
